import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import {
  BankMatchStatus,
} from '../common/enums/bank-transaction.enum.js';
import {
  PAYMENT_METHOD_ACCOUNT_PREFIX,
  PaymentMethod,
} from '../common/enums/payment-method.enum.js';
import {
  isCapturedIntentStatus,
  isConclusiveIntentStatus,
  needsProviderPoll,
  PaymentIntentStatus,
} from '../common/enums/payment-intent-status.enum.js';
import { ReconciliationExceptionType } from '../common/enums/reconciliation-exception.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { moneyToString } from '../common/utils/money.util.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import type { JobRun } from '../jobs/entities/job-run.entity.js';
import { JobName, JobQueue, JobTrigger } from '../jobs/enums/job.enum.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../jobs/enums/notification.enum.js';
import { WebhookEventType } from '../jobs/enums/webhook.enum.js';
import type { InboundEventContext, InboundEventOutcome } from '../jobs/interfaces/inbound-event-handler.interface.js';
import { NotificationsService } from '../jobs/notifications.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { WebhooksService } from '../jobs/webhooks.service.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import { PartiesService } from '../parties/parties.service.js';
import { BankTransaction } from '../reconciliation/entities/bank-transaction.entity.js';
import { ReconciliationExceptionsService } from '../reconciliation/reconciliation-exceptions.service.js';
import { SalesInvoice } from '../invoices/entities/sales-invoice.entity.js';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto.js';
import type { QueryPaymentIntentsDto } from './dto/query-payment-intents.dto.js';
import { PaymentIntent } from './entities/payment-intent.entity.js';
import {
  isProviderPaymentEventType,
  ProviderPaymentEventType,
} from './enums/provider-event.enum.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './interfaces/payment-provider.interface.js';

/** Kết quả một lần áp dụng trạng thái từ provider. */
interface AppliedOutcome {
  outcome: 'captured' | 'authorized' | 'failed' | 'refunded' | 'expired' | 'unknown';
  providerRef: string | null;
  failureReason: string | null;
}

export interface PollSummary {
  scanned: number;
  captured: number;
  settled: number;
  stillUnknown: number;
  escalated: number;
  conflicts: number;
}

/**
 * Số lần tra cứu trước khi **leo thang** sang `pending_verification`.
 *
 * Điểm cốt lõi: leo thang **không** có nghĩa là kết luận thất bại. Sau ngưỡng này
 * hệ thống gửi thông báo cho người ghi sổ và ghi một dòng lệch — vẫn tiếp tục tra
 * cứu, vì "chưa biết" mãi mãi vẫn đúng hơn "đoán sai".
 */
const ESCALATE_AFTER_ATTEMPTS = Number(
  process.env.PAYMENT_POLL_ESCALATE_AFTER ?? 5,
);

/**
 * **Vòng đời thanh toán** (mục 10.B).
 *
 * Trả lời trực tiếp hai yêu cầu gốc của dự án:
 *
 * 1. *"Vì sao timeout không đồng nghĩa với thanh toán thất bại"* — `charge` lỗi
 *    timeout chỉ đưa intent sang `unknown`, **không** sang `failed`. Chỉ khi
 *    provider trả về một kết luận có bằng chứng (qua `query` hoặc webhook) thì
 *    trạng thái mới được chốt.
 * 2. *"Phục hồi mà không tạo giao dịch trùng"* — mọi lần tra cứu/ghi sổ dùng lại
 *    đúng `idempotencyKey`, và bút toán ghi sổ dùng `source_id = intent.id` nên
 *    ràng buộc `UNIQUE(source_type, source_id)` chặn tuyệt đối việc sinh bút toán
 *    thứ hai — kể cả khi hai request chạy song song.
 *
 * Ghi chú thiết kế: `source_id` dùng **id của intent**, không dùng id sự kiện
 * webhook. Lý do: một intent có thể nhận nhiều sự kiện (`authorized` rồi `captured`),
 * nếu lấy `source_id = event.id` thì mỗi sự kiện sẽ là một "chứng từ nguồn" khác
 * nhau và có thể sinh nhiều bút toán. Bất biến cần giữ là **một khoản tiền ⇒ một
 * bút toán**, nên chứng từ nguồn phải là chính yêu cầu thanh toán.
 */
@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    @InjectRepository(PaymentIntent)
    private readonly intents: Repository<PaymentIntent>,
    @InjectRepository(SalesInvoice)
    private readonly invoices: Repository<SalesInvoice>,
    @InjectRepository(BankTransaction)
    private readonly bankTransactions: Repository<BankTransaction>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly accounts: AccountsService,
    private readonly parties: PartiesService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly exceptions: ReconciliationExceptionsService,
    private readonly queue: QueueService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------------ tạo

  /**
   * Tạo yêu cầu thanh toán và gửi tới provider.
   *
   * Idempotent theo `idempotencyKey`: gửi lại cùng khóa ⇒ trả về **đúng intent cũ**,
   * không gọi provider lần hai. Đây là hành vi bắt buộc để client có thể retry an toàn
   * khi chính request tạo intent bị timeout.
   */
  async create(
    dto: CreatePaymentIntentDto,
    actor: AuthUser,
  ): Promise<PaymentIntent> {
    const idempotencyKey = dto.idempotencyKey.trim();
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }

    const partyId = await this.resolvePartyId(dto);
    const cashAccountId = await this.resolveCashAccountId(dto);
    const code = dto.code?.trim() || this.generateCode();

    const codeTaken = await this.intents.findOne({ where: { code } });
    if (codeTaken) {
      throw new ConflictException(`Mã yêu cầu thanh toán "${code}" đã tồn tại`);
    }

    const intent = this.intents.create({
      code,
      idempotencyKey,
      amount: moneyToString(dto.amount),
      date: dto.date,
      currency: (dto.currency ?? 'VND').trim().toUpperCase(),
      fxAmount: null,
      fxRate: null,
      method: dto.method,
      partyId,
      salesInvoiceId: dto.salesInvoiceId ?? null,
      cashAccountId,
      description: dto.description?.trim() || null,
      status: PaymentIntentStatus.INITIATED,
      providerRef: null,
      providerEventId: null,
      attempts: 0,
      lastCheckedAt: null,
      lastError: null,
      journalEntryId: null,
      capturedAt: null,
      settledAt: null,
      createdBy: actor.id,
    });

    let saved: PaymentIntent;
    try {
      saved = await this.intents.save(intent);
    } catch (error) {
      // Hai request đồng thời cùng khóa: bản ghi thắng đã tồn tại ⇒ trả về nó.
      const raced = await this.findByIdempotencyKey(idempotencyKey);
      if (raced) return raced;
      throw error;
    }

    // Gửi tới provider. Lỗi/timeout KHÔNG làm hỏng bản ghi — intent đã tồn tại
    // và sẽ được tra cứu lại (đúng tinh thần "timeout ≠ thất bại").
    try {
      const charge = await this.provider.charge({
        idempotencyKey,
        amount: moneyToString(dto.amount),
        currency: intent.currency,
        method: dto.method,
        reference: dto.reference ?? null,
      });

      return await this.applyOutcome(
        saved,
        {
          outcome: charge.outcome,
          providerRef: charge.providerRef,
          failureReason: charge.failureReason,
        },
        { source: 'charge' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Gọi provider thất bại cho ${saved.code} (${idempotencyKey}): ${message} — giữ trạng thái "chưa biết"`,
      );
      return this.applyOutcome(
        saved,
        { outcome: 'unknown', providerRef: null, failureReason: message },
        { source: 'charge' },
      );
    }
  }

  // -------------------------------------------------------------- truy vấn

  async list(query: QueryPaymentIntentsDto = {}): Promise<PaymentIntent[]> {
    const qb = this.intents
      .createQueryBuilder('intent')
      .orderBy('intent.date', 'DESC')
      .addOrderBy('intent.createdAt', 'DESC')
      .take(query.limit ?? 50)
      .skip(query.offset ?? 0);

    if (query.status) qb.andWhere('intent.status = :status', { status: query.status });
    if (query.method) qb.andWhere('intent.method = :method', { method: query.method });
    if (query.partyId) qb.andWhere('intent.partyId = :partyId', { partyId: query.partyId });
    if (query.fromDate) qb.andWhere('intent.date >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate) qb.andWhere('intent.date <= :toDate', { toDate: query.toDate });
    if (query.search) {
      qb.andWhere(
        '(intent.code ILIKE :s OR intent.providerRef ILIKE :s OR intent.description ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<PaymentIntent> {
    const intent = await this.intents.findOne({ where: { id } });
    if (!intent) {
      throw new NotFoundException('Không tìm thấy yêu cầu thanh toán');
    }
    return intent;
  }

  findByIdempotencyKey(key: string): Promise<PaymentIntent | null> {
    return this.intents.findOne({ where: { idempotencyKey: key } });
  }

  // ------------------------------------------------------------- tra cứu lại

  /**
   * Tra cứu lại provider cho một intent (thao tác của người dùng hoặc của job).
   *
   * **Không** kết luận khi provider chưa trả lời được — chỉ ghi nhận `unknown` và
   * tăng số lần thử.
   */
  async refresh(id: string, actor?: AuthUser | null): Promise<PaymentIntent> {
    const intent = await this.findById(id);

    if (isConclusiveIntentStatus(intent.status) && intent.journalEntryId) {
      return intent;
    }

    const result = await this.provider.query(intent.idempotencyKey);
    void actor;
    return this.applyOutcome(
      intent,
      {
        outcome: result.outcome,
        providerRef: result.providerRef,
        failureReason: result.failureReason,
      },
      { source: 'query' },
    );
  }

  /**
   * Quét mọi intent **chưa kết luận** rồi tra cứu lại — thân của job
   * `payment-status-poll` (cron 2 phút).
   *
   * Sau khi tra cứu, hàm còn đối chiếu với sao kê để chuyển các intent đã thu tiền
   * sang `settled` (xem `settleFromStatements`).
   */
  async pollPending(limit = 100): Promise<PollSummary> {
    const pending = await this.intents.find({
      where: {
        status: In([
          PaymentIntentStatus.INITIATED,
          PaymentIntentStatus.AUTHORIZED,
          PaymentIntentStatus.UNKNOWN,
          PaymentIntentStatus.PENDING_VERIFICATION,
        ]),
      },
      order: { lastCheckedAt: 'ASC', createdAt: 'ASC' },
      take: limit,
    });

    const summary: PollSummary = {
      scanned: pending.length,
      captured: 0,
      settled: 0,
      stillUnknown: 0,
      escalated: 0,
      conflicts: 0,
    };

    for (const intent of pending) {
      const before = intent.status;
      const after = await this.refresh(intent.id);

      if (isCapturedIntentStatus(after.status) && !isCapturedIntentStatus(before)) {
        summary.captured += 1;
      } else if (
        after.status === PaymentIntentStatus.PENDING_VERIFICATION &&
        before !== PaymentIntentStatus.PENDING_VERIFICATION
      ) {
        summary.escalated += 1;
      } else if (needsProviderPoll(after.status)) {
        summary.stillUnknown += 1;
      }
    }

    summary.settled = await this.settleFromStatements();
    return summary;
  }

  /**
   * Chuyển intent đã thu tiền sang `settled` khi tìm thấy dòng sao kê khớp.
   *
   * Đây là bước khép kín vòng đời: `captured` nghĩa là *provider nói đã thu*,
   * còn `settled` nghĩa là *tiền đã thực sự về tài khoản ngân hàng*. Phân biệt hai
   * mốc này là điều kiện để đối soát có ý nghĩa.
   */
  async settleFromStatements(): Promise<number> {
    const captured = await this.intents.find({
      where: { status: PaymentIntentStatus.CAPTURED },
    });

    let settled = 0;
    for (const intent of captured) {
      if (!intent.providerRef) continue;

      const line = await this.bankTransactions.findOne({
        where: {
          bankRef: intent.providerRef,
          matchStatus: BankMatchStatus.MATCHED,
        },
      });
      if (!line) continue;

      intent.status = PaymentIntentStatus.SETTLED;
      intent.settledAt = new Date();
      await this.intents.save(intent);
      settled += 1;

      await this.dispatchSettled(intent);
    }
    return settled;
  }

  // ------------------------------------------------------- điều phối webhook

  /**
   * Áp dụng một sự kiện thanh toán nhận từ provider (handler của registry mục 9).
   *
   * Tìm intent theo thứ tự: `payload.intentId` → `payload.providerRef` →
   * `resourceRef` (nếu là uuid) → `payload.idempotencyKey`. Không tìm thấy thì
   * trả `handled: false` — sự kiện vẫn được lưu ở `webhook_events` để kiểm toán.
   */
  async handleProviderEvent(
    context: InboundEventContext,
  ): Promise<InboundEventOutcome> {
    if (!isProviderPaymentEventType(context.eventType)) {
      return { handled: false, detail: { reason: 'event-type-not-payment' } };
    }

    const payload = context.payload;
    const intent = await this.resolveIntentForEvent(payload, context.resourceRef);
    if (!intent) {
      this.logger.warn(
        `Sự kiện ${context.eventType} (${context.externalId}) không tìm thấy yêu cầu thanh toán tương ứng`,
      );
      return { handled: false, detail: { reason: 'intent-not-found' } };
    }

    const outcome = this.outcomeFromEvent(context.eventType, payload);
    const updated = await this.applyOutcome(intent, outcome, {
      source: 'webhook',
      eventId: context.externalId,
    });

    return {
      handled: true,
      detail: {
        intentId: updated.id,
        code: updated.code,
        status: updated.status,
        eventType: context.eventType,
      },
    };
  }

  // ------------------------------------------------------------ hạch toán

  /**
   * Ghi sổ khoản tiền đã thu: **Nợ 111/112 · Có 131 (đối tượng)**.
   *
   * Chạy trong **cùng transaction** với việc cập nhật intent (`postDocument` +
   * `commit`), nên không thể xảy ra trạng thái "bút toán đã ghi nhưng intent chưa
   * đổi" — chính trạng thái đó sẽ làm intent kẹt vĩnh viễn khi thử lại.
   */
  private async postCapture(intent: PaymentIntent): Promise<string> {
    const period = await this.periods.resolveByDate(intent.date);
    this.periods.assertAcceptsPostings(period);

    const cashAccount = await this.resolveCashAccount(intent);
    const party = await this.parties.resolveActive(this.requirePartyId(intent));

    const partyAccount = await this.accounts.requirePostableByCodePrefix(
      '131',
      'phải thu khách hàng (131*)',
    );

    const amount = moneyToString(intent.amount);
    const description = intent.description ?? `Thu tiền ${intent.code}`;

    const lines: CreateJournalLineDto[] = [
      { accountId: cashAccount.id, debit: amount, description },
      {
        accountId: partyAccount.id,
        credit: amount,
        partyId: party.id,
        description,
      },
    ];

    const posted = await this.journals.postDocument(
      {
        date: intent.date,
        description,
        reference: intent.code,
        // Chứng từ nguồn là **yêu cầu thanh toán** — xem ghi chú ở doc class.
        sourceType: SourceType.PROVIDER_EVENT,
        sourceId: intent.id,
        lines,
      },
      intent.createdBy,
      async (manager, entry) => {
        await manager.update(PaymentIntent, intent.id, {
          status: PaymentIntentStatus.CAPTURED,
          journalEntryId: entry.id,
          capturedAt: new Date(),
        });
      },
    );

    return posted.id;
  }

  // -------------------------------------------------------------- nội bộ

  private async applyOutcome(
    intent: PaymentIntent,
    outcome: AppliedOutcome,
    context: { source: 'charge' | 'query' | 'webhook'; eventId?: string },
  ): Promise<PaymentIntent> {
    const alreadyConclusive = isConclusiveIntentStatus(intent.status);

    // (1) "Chưa biết" — KHÔNG được biến thành thất bại.
    if (outcome.outcome === 'unknown') {
      intent.attempts += 1;
      intent.lastCheckedAt = new Date();
      intent.lastError = outcome.failureReason;

      if (!alreadyConclusive && !isCapturedIntentStatus(intent.status)) {
        const escalated = intent.attempts >= ESCALATE_AFTER_ATTEMPTS;
        intent.status = escalated
          ? PaymentIntentStatus.PENDING_VERIFICATION
          : PaymentIntentStatus.UNKNOWN;

        if (escalated) {
          await this.escalate(intent, outcome.failureReason);
        }
      }

      return this.intents.save(intent);
    }

    // (2) Trạng thái đã chốt ⇒ kết quả mới **không** được ghi đè.
    if (alreadyConclusive) {
      if (this.conflictsWithTerminal(intent.status, outcome.outcome)) {
        await this.recordLateConflict(intent, outcome, context);
      }
      return intent;
    }

    switch (outcome.outcome) {
      case 'captured': {
        intent.status = PaymentIntentStatus.CAPTURED;
        intent.capturedAt = intent.capturedAt ?? new Date();
        intent.providerRef = outcome.providerRef ?? intent.providerRef;
        if (context.eventId) intent.providerEventId = context.eventId;

        // Ghi sổ **idempotent**: chỉ khi chưa có bút toán.
        if (!intent.journalEntryId) {
          try {
            intent.journalEntryId = await this.postCapture(intent);
            intent.lastError = null;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Không nuốt lỗi hạch toán: giữ nguyên sự thật "đã thu tiền" và ghi lại
            // lý do chưa ghi sổ để lần tra cứu sau thử tiếp.
            intent.lastError = `Đã thu tiền nhưng chưa ghi sổ: ${message}`;
            this.logger.error(`${intent.lastError} (intent ${intent.code})`);
          }
        }
        break;
      }
      case 'authorized':
        intent.status = PaymentIntentStatus.AUTHORIZED;
        intent.providerRef = outcome.providerRef ?? intent.providerRef;
        break;
      case 'failed':
        intent.status = PaymentIntentStatus.FAILED;
        intent.lastError = outcome.failureReason;
        break;
      case 'expired':
        intent.status = PaymentIntentStatus.EXPIRED;
        break;
      case 'refunded':
        intent.status = PaymentIntentStatus.REFUNDED;
        break;
    }

    intent.attempts += 1;
    intent.lastCheckedAt = new Date();
    intent.providerRef = intent.providerRef ?? outcome.providerRef;

    return this.intents.save(intent);
  }

  /**
   * Kết quả mới có **mâu thuẫn** với trạng thái đã chốt không?
   *
   * Chỉ những cặp thật sự trái ngược mới tính là mâu thuẫn: `captured` khi đã
   * `failed`, `failed` khi đã `settled`… Còn `captured` khi đã `captured` là
   * **bình thường** (provider gửi lại cùng sự kiện) và phải im lặng bỏ qua.
   */
  private conflictsWithTerminal(
    current: PaymentIntentStatus,
    incoming: AppliedOutcome['outcome'],
  ): boolean {
    const expected: Partial<Record<AppliedOutcome['outcome'], PaymentIntentStatus[]>> = {
      captured: [PaymentIntentStatus.CAPTURED, PaymentIntentStatus.SETTLED],
      failed: [PaymentIntentStatus.FAILED],
      refunded: [PaymentIntentStatus.REFUNDED],
      expired: [PaymentIntentStatus.EXPIRED],
      authorized: [
        PaymentIntentStatus.AUTHORIZED,
        PaymentIntentStatus.CAPTURED,
        PaymentIntentStatus.SETTLED,
      ],
    };

    const allowed = expected[incoming] ?? [];
    return !allowed.includes(current);
  }

  /**
   * Kết quả **đến trễ mâu thuẫn** ⇒ không ghi đè, sinh `reconciliation_exception`.
   *
   * Đây là "xử lý kết quả đến trễ" ở **mức nghiệp vụ** (khác mức giao vận ở mục 9):
   * tầng webhook đã loại sự kiện cũ hơn sự kiện đã xử lý, nhưng ở đây mâu thuẫn
   * nằm ở *nội dung* — hai kết luận trái ngược cho cùng một khoản tiền. Hệ thống
   * không tự chọn bên nào; nó ghi lại để con người quyết định.
   */
  private async recordLateConflict(
    intent: PaymentIntent,
    outcome: AppliedOutcome,
    context: { source: string; eventId?: string },
  ): Promise<void> {
    await this.exceptions.record({
      type: ReconciliationExceptionType.LATE_EVENT_CONFLICT,
      dedupeKey: `late_event_conflict:${intent.id}:${outcome.outcome}`,
      amount: intent.amount,
      detail:
        `Yêu cầu thanh toán ${intent.code} đang ở trạng thái "${intent.status}" (đã chốt) ` +
        `nhưng nhận được kết quả "${outcome.outcome}" từ ${context.source}` +
        (context.eventId ? ` (sự kiện ${context.eventId})` : '') +
        `. KHÔNG ghi đè trạng thái — cần người xử lý.`,
    });

    this.logger.warn(
      `Mâu thuẫn trạng thái cho ${intent.code}: đã "${intent.status}", nhận "${outcome.outcome}"`,
    );
  }

  /** Leo thang khi tra cứu mãi vẫn "chưa biết" — thông báo + dòng lệch, KHÔNG kết luận. */
  private async escalate(
    intent: PaymentIntent,
    reason: string | null,
  ): Promise<void> {
    await this.notifications.create({
      type: NotificationType.SYSTEM,
      severity: NotificationSeverity.WARNING,
      audience: NotificationAudience.POSTER,
      title: `Thanh toán chưa xác minh được: ${intent.code}`,
      body: [
        `Đã tra cứu ${intent.attempts} lần mà provider vẫn chưa trả về kết luận.`,
        `Số tiền: ${intent.amount} ${intent.currency}.`,
        `Mã chống trùng: ${intent.idempotencyKey}.`,
        reason ? `Lý do gần nhất: ${reason}` : '',
        'LƯU Ý: chưa có kết luận KHÔNG có nghĩa là giao dịch thất bại — cần kiểm tra với provider.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      data: {
        intentId: intent.id,
        code: intent.code,
        attempts: intent.attempts,
        idempotencyKey: intent.idempotencyKey,
      },
    });

    await this.exceptions.record({
      type: ReconciliationExceptionType.MISSING_STATEMENT,
      dedupeKey: `unverified_payment:${intent.id}`,
      amount: intent.amount,
      detail:
        `Yêu cầu thanh toán ${intent.code} chưa xác minh được sau ${intent.attempts} lần tra cứu ` +
        `(idempotencyKey=${intent.idempotencyKey}). Chưa kết luận thất bại.`,
    });
  }

  private async dispatchSettled(intent: PaymentIntent): Promise<void> {
    try {
      await this.webhooks.dispatch({
        eventType: WebhookEventType.PAYMENT_INTENT_SETTLED,
        resourceRef: intent.id,
        data: {
          code: intent.code,
          amount: intent.amount,
          currency: intent.currency,
          providerRef: intent.providerRef,
          journalEntryId: intent.journalEntryId,
          settledAt: intent.settledAt?.toISOString() ?? null,
        },
        trigger: JobTrigger.SYSTEM,
        actor: null,
      });
    } catch (error) {
      this.logger.error(
        `Không xếp được webhook payment_intent.settled cho ${intent.code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private outcomeFromEvent(
    eventType: ProviderPaymentEventType,
    payload: Record<string, unknown>,
  ): AppliedOutcome {
    const providerRef = asText(payload.providerRef);
    const reason = asText(payload.reason) ?? asText(payload.failureReason);

    switch (eventType) {
      case ProviderPaymentEventType.CAPTURED:
        return { outcome: 'captured', providerRef, failureReason: null };
      case ProviderPaymentEventType.AUTHORIZED:
        return { outcome: 'authorized', providerRef, failureReason: null };
      case ProviderPaymentEventType.FAILED:
        return { outcome: 'failed', providerRef, failureReason: reason };
      case ProviderPaymentEventType.REFUNDED:
        return { outcome: 'refunded', providerRef, failureReason: reason };
      case ProviderPaymentEventType.EXPIRED:
        return { outcome: 'expired', providerRef, failureReason: reason };
    }
  }

  private async resolveIntentForEvent(
    payload: Record<string, unknown>,
    resourceRef: string,
  ): Promise<PaymentIntent | null> {
    const byId = asText(payload.intentId);
    if (byId) {
      const found = await this.intents.findOne({ where: { id: byId } });
      if (found) return found;
    }

    const providerRef = asText(payload.providerRef);
    if (providerRef) {
      const found = await this.intents.findOne({ where: { providerRef } });
      if (found) return found;
    }

    const byKey = asText(payload.idempotencyKey);
    if (byKey) {
      const found = await this.findByIdempotencyKey(byKey);
      if (found) return found;
    }

    // `resourceRef` có thể là id intent hoặc mã tham chiếu provider.
    if (isUuid(resourceRef)) {
      const found = await this.intents.findOne({ where: { id: resourceRef } });
      if (found) return found;
    }
    return this.intents.findOne({ where: { providerRef: resourceRef } });
  }

  private async resolvePartyId(dto: CreatePaymentIntentDto): Promise<string> {
    if (dto.partyId) {
      const party = await this.parties.resolveActive(dto.partyId);
      return party.id;
    }

    if (dto.salesInvoiceId) {
      const invoice = await this.invoices.findOne({
        where: { id: dto.salesInvoiceId },
      });
      if (!invoice) {
        throw new BadRequestException('Không tìm thấy hóa đơn bán');
      }
      return invoice.partyId;
    }

    // Không có đối tượng ⇒ không thể hạch toán vào 131 khi thu tiền. Chặn ngay từ
    // đầu thay vì để khoản tiền đã thu rơi vào trạng thái không ghi sổ được.
    throw new BadRequestException(
      'Cần khai partyId (hoặc salesInvoiceId) để xác định tài khoản công nợ khi thu tiền',
    );
  }

  private async resolveCashAccountId(
    dto: CreatePaymentIntentDto,
  ): Promise<string> {
    if (dto.cashAccountId) {
      const account = await this.accounts.getPostable(dto.cashAccountId);
      return account.id;
    }
    return (await this.resolveCashAccountByMethod(dto.method)).id;
  }

  private async resolveCashAccount(intent: PaymentIntent): Promise<{ id: string }> {
    if (intent.cashAccountId) {
      return this.accounts.getPostable(intent.cashAccountId);
    }
    return this.resolveCashAccountByMethod(intent.method);
  }

  private async resolveCashAccountByMethod(method: PaymentMethod) {
    const prefix = PAYMENT_METHOD_ACCOUNT_PREFIX[method];
    if (!prefix) {
      throw new BadRequestException(
        'Phương thức "khác" cần khai cashAccountId — hệ thống không đoán tài khoản tiền',
      );
    }
    return this.accounts.requirePostableByCodePrefix(
      prefix,
      prefix === '111' ? 'tiền mặt (111*)' : 'tiền gửi ngân hàng (112*)',
    );
  }

  private requirePartyId(intent: PaymentIntent): string {
    if (!intent.partyId) {
      throw new BadRequestException(
        `Yêu cầu thanh toán ${intent.code} chưa có đối tượng — không ghi sổ được vào tài khoản công nợ`,
      );
    }
    return intent.partyId;
  }

  /** Xếp job tra cứu lại một intent ngay (dùng cho nút "tra cứu lại" trên giao diện). */
  async enqueueRefresh(intentId: string, actor: AuthUser): Promise<JobRun> {
    return this.queue.enqueue({
      queue: JobQueue.PAYMENTS,
      jobName: JobName.PAYMENT_STATUS_POLL,
      payload: { intentId },
      trigger: JobTrigger.API,
      actor,
    });
  }

  private generateCode(): string {
    return `PI-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
