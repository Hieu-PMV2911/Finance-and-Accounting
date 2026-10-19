import { randomBytes, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import {
  PAYMENT_DIRECTION_LABELS,
  PaymentDirection,
} from '../common/enums/payment-direction.enum.js';
import {
  PAYMENT_METHOD_ACCOUNT_PREFIX,
  PAYMENT_METHOD_LABELS,
} from '../common/enums/payment-method.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import {
  exceedsMoneyRange,
  isPositiveMoney,
  moneyEquals,
  moneyToString,
  toMoney,
} from '../common/utils/money.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import { JournalsService } from '../journals/journals.service.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../jobs/enums/notification.enum.js';
import type { InboundWebhookHandlerInput } from '../jobs/interfaces/inbound-webhook.interface.js';
import { NotificationsService } from '../jobs/notifications.service.js';
import { PaymentPollRegistry } from '../jobs/payment-poll.registry.js';
import { WebhooksService } from '../jobs/webhooks.service.js';
import { PartiesService } from '../parties/parties.service.js';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto.js';
import type { QueryPaymentIntentsDto } from './dto/query-payment-intents.dto.js';
import { PaymentIntent } from './entities/payment-intent.entity.js';
import {
  PAYMENT_INTENT_STATUS_LABELS,
  PaymentIntentStatus,
  canPollProvider,
  isCaptured,
  isFinalIntentStatus,
} from './enums/payment-intent-status.enum.js';
import { ReconciliationExceptionType } from './enums/reconciliation-exception.enum.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderOutcome,
  type ProviderResult,
} from './interfaces/payment-provider.interface.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';

/**
 * Người thao tác khi bút toán do **hệ thống** tạo (webhook/cron), không do người.
 *
 * Dùng UUID rỗng thay vì mượn id người tạo intent: vết kiểm toán phải nói đúng
 * sự thật — bút toán này không do một con người bấm nút. Cột `created_by` của
 * bút toán không có khóa ngoại nên giá trị này hợp lệ.
 */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/** Số lần tra cứu tối đa trước khi leo thang (`PAYMENT_INTENT_MAX_POLLS`). */
function maxPollAttempts(): number {
  const parsed = Number(process.env.PAYMENT_INTENT_MAX_POLLS ?? 5);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 5;
}

/** Loại sự kiện webhook nhận vào ⇒ kết luận của provider. */
const INBOUND_EVENT_OUTCOMES: Record<string, ProviderOutcome> = {
  'payment.captured': 'captured',
  'payment.authorized': 'authorized',
  'payment.failed': 'failed',
  'payment.refunded': 'refunded',
  'payment.expired': 'expired',
};

export interface PaymentIntentPollView {
  intent: PaymentIntent;
  /** `null` = không gọi provider (đã ở trạng thái cuối). */
  outcome: ProviderOutcome | null;
  /** Lần này có sinh bút toán không. */
  posted: boolean;
  /** Lần này có leo thang cho con người không. */
  escalated: boolean;
  /** Kết quả mâu thuẫn trạng thái cuối ⇒ đã ghi ngoại lệ, không ghi đè. */
  conflict: boolean;
}

export interface PaymentIntentSweepResult {
  checked: number;
  captured: number;
  escalated: number;
  conflicts: number;
  failed: number;
}

interface ApplyContext {
  /** Id sự kiện webhook (nếu kết quả đến từ webhook). */
  externalRef: string | null;
  /** `true` khi có người đang chờ phản hồi HTTP ⇒ ném lỗi ghi sổ ra ngoài. */
  throwOnPostingFailure: boolean;
}

interface ApplyOutcome {
  intent: PaymentIntent;
  outcome: ProviderOutcome;
  posted: boolean;
  conflictRecorded: boolean;
}

/**
 * Ý định thanh toán (mục 10.B — P2.1).
 *
 * Nguyên tắc thiết kế:
 *
 * 1. **Timeout không phải thất bại.** Lỗi gọi provider được biến thành
 *    `outcome = unknown`; intent chuyển sang `unknown` và được tra cứu lại theo
 *    đúng `idempotencyKey` cho tới khi có kết luận.
 * 2. **Chỉ một bút toán cho một intent.** Ghi sổ dùng `source_type =
 *    provider_event`, `source_id = intent.id` — unique index ở DB là lá chắn
 *    cuối, kể cả khi webhook và cron cùng lúc thấy "đã thu tiền".
 * 3. **Trạng thái cuối không bị ghi đè.** Kết quả đến trễ mâu thuẫn chỉ sinh
 *    `reconciliation_exception`, không sửa trạng thái đã chốt.
 * 4. **Không đoán khi chưa chắc.** Quá ngưỡng tra cứu ⇒ ngoại lệ + thông báo,
 *    dừng tự động tra cứu; con người xác minh với sao kê/nhà cung cấp.
 * 5. **Không gọi provider nếu không thể hạch toán.** Kỳ đã khóa hoặc thiếu tài
 *    khoản tiền bị chặn **trước** khi tiền bị thu.
 */
@Injectable()
export class PaymentIntentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    @InjectRepository(PaymentIntent)
    private readonly intents: Repository<PaymentIntent>,
    private readonly parties: PartiesService,
    private readonly accounts: AccountsService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly polls: PaymentPollRegistry,
    private readonly exceptions: ReconciliationExceptionsService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
  ) {}

  /**
   * Nhận kết quả thanh toán do provider gọi vào (`POST /api/webhooks/inbound`).
   *
   * Đăng ký ở đây thay vì để `WebhooksService` biết về payment-intents: tầng
   * webhook chỉ là cổng vận chuyển, không được phụ thuộc nghiệp vụ thanh toán
   * (nếu không sẽ thành vòng import `JobsModule ↔ PaymentIntentsModule`).
   */
  onModuleInit(): void {
    for (const eventType of Object.keys(INBOUND_EVENT_OUTCOMES)) {
      this.webhooks.registerInboundHandler(eventType, (input) =>
        this.applyInboundEvent(input),
      );
    }
    // Cho worker hàng đợi `payments` gọi lại nghiệp vụ tra cứu (mục 10.B).
    this.polls.register(this);
  }

  async list(query: QueryPaymentIntentsDto = {}): Promise<PaymentIntent[]> {
    const qb = this.intents
      .createQueryBuilder('intent')
      .leftJoinAndSelect('intent.party', 'party')
      .orderBy('intent.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('intent.status = :status', { status: query.status });
    }
    if (query.direction) {
      qb.andWhere('intent.direction = :direction', {
        direction: query.direction,
      });
    }
    if (query.partyId) {
      qb.andWhere('intent.partyId = :partyId', { partyId: query.partyId });
    }
    if (query.fromDate) {
      qb.andWhere('intent.date >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('intent.date <= :toDate', { toDate: query.toDate });
    }
    if (query.search) {
      qb.andWhere(
        '(intent.code ILIKE :s OR intent.reference ILIKE :s OR intent.providerRef ILIKE :s OR intent.idempotencyKey ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.take(query.limit ?? 50).getMany();
  }

  async findById(id: string): Promise<PaymentIntent> {
    const intent = await this.intents.findOne({
      where: { id },
      relations: { party: true },
    });
    if (!intent) {
      throw new BadRequestException('Không tìm thấy giao dịch thanh toán');
    }
    return intent;
  }

  /**
   * Tạo intent và gọi provider **đồng bộ**.
   *
   * Đồng bộ vì phần lớn giao dịch kết luận ngay; trường hợp chưa kết luận sẽ do
   * cron `payment-status-poll` tiếp tục. Preflight (kỳ, tài khoản, số tiền)
   * chạy **trước** khi gọi provider — đã thu tiền rồi mới phát hiện không ghi
   * sổ được là tình huống tệ nhất có thể tránh.
   */
  async create(
    dto: CreatePaymentIntentDto,
    actorId: string,
  ): Promise<PaymentIntent> {
    await this.parties.resolveActive(dto.partyId);

    const amount = toMoney(dto.amount);
    if (!isPositiveMoney(amount)) {
      throw new BadRequestException('Số tiền giao dịch phải lớn hơn 0');
    }
    if (exceedsMoneyRange(amount)) {
      throw new BadRequestException('Số tiền vượt quá giới hạn lưu trữ');
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || `pi_${randomUUID()}`;
    const existing = await this.intents.findOne({
      where: { idempotencyKey },
      relations: { party: true },
    });
    if (existing) {
      return existing;
    }

    const date = dto.date ?? this.todayIso();
    const direction = dto.direction ?? PaymentDirection.RECEIPT;

    // Preflight: không gọi provider khi chắc chắn không hạch toán được.
    const period = await this.periods.resolveByDate(date);
    this.periods.assertAcceptsPostings(period);
    await this.resolveCashAccount({
      cashAccountId: dto.cashAccountId ?? null,
      method: dto.method,
    });
    await this.resolvePartyAccount(direction);

    const intent = this.intents.create({
      code: await this.nextCode(),
      idempotencyKey,
      direction,
      partyId: dto.partyId,
      invoiceId: dto.invoiceId ?? null,
      date,
      amount: moneyToString(amount),
      currency: (dto.currency ?? 'VND').trim().toUpperCase() || 'VND',
      method: dto.method,
      cashAccountId: dto.cashAccountId ?? null,
      reference: dto.reference?.trim() || null,
      description: dto.description?.trim() || null,
      status: PaymentIntentStatus.INITIATED,
      provider: this.provider.name,
      providerRef: null,
      providerStatus: null,
      attempts: 0,
      lastCheckedAt: null,
      escalationNotifiedAt: null,
      journalEntryId: null,
      capturedAt: null,
      settledAt: null,
      createdBy: actorId,
    });

    let saved: PaymentIntent;
    try {
      saved = await this.intents.save(intent);
    } catch (error) {
      // Đua nhau gửi cùng khóa ⇒ bản ghi thắng đã tồn tại, trả về nó.
      const raced = await this.intents.findOne({
        where: { idempotencyKey },
        relations: { party: true },
      });
      if (raced) return raced;
      throw error;
    }

    const result = await this.chargeWithProvider(saved);
    await this.applyProviderResult(saved, result, actorId, {
      externalRef: null,
      throwOnPostingFailure: true,
    });

    return this.findById(saved.id);
  }

  /**
   * Tra cứu lại provider cho một intent (nút "Tra cứu lại" hoặc cron).
   *
   * `actorId = null` nghĩa là hệ thống gọi (cron/webhook) — bút toán sẽ mang
   * `SYSTEM_ACTOR_ID`, không mượn danh người tạo.
   */
  async poll(id: string, actorId: string | null): Promise<PaymentIntentPollView> {
    const intent = await this.findById(id);

    if (!canPollProvider(intent.status)) {
      return {
        intent,
        outcome: null,
        posted: false,
        escalated: false,
        conflict: false,
      };
    }

    intent.attempts += 1;
    const result = await this.fetchFromProvider(intent);
    const applied = await this.applyProviderResult(
      intent,
      result,
      actorId ?? SYSTEM_ACTOR_ID,
      { externalRef: null, throwOnPostingFailure: actorId !== null },
    );

    const escalated = await this.maybeEscalate(applied.intent);

    return {
      intent: escalated ? await this.findById(id) : applied.intent,
      outcome: result.outcome,
      posted: applied.posted,
      escalated,
      conflict: applied.conflictRecorded,
    };
  }

  /**
   * Quét các intent chưa kết luận — thân của cron `payment-status-poll`.
   *
   * Bỏ qua intent đã leo thang (`escalationNotifiedAt`) và intent đã chạm
   * ngưỡng: gọi mãi một provider đang sự cố không làm ra kết quả, chỉ tăng tải.
   */
  async pollPending(limit = 50): Promise<PaymentIntentSweepResult> {
    const threshold = maxPollAttempts();
    const pending = await this.intents.find({
      where: {
        status: In([
          PaymentIntentStatus.INITIATED,
          PaymentIntentStatus.AUTHORIZED,
          PaymentIntentStatus.UNKNOWN,
        ]),
        escalationNotifiedAt: IsNull(),
        attempts: LessThan(threshold),
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    const summary: PaymentIntentSweepResult = {
      checked: 0,
      captured: 0,
      escalated: 0,
      conflicts: 0,
      failed: 0,
    };

    for (const intent of pending) {
      summary.checked += 1;
      try {
        const result = await this.poll(intent.id, null);
        if (result.posted) summary.captured += 1;
        if (result.escalated) summary.escalated += 1;
        if (result.conflict) summary.conflicts += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.error(
          `Tra cứu giao dịch ${intent.code} thất bại: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return summary;
  }

  /** Đánh dấu tiền đã về tài khoản ngân hàng (đối chiếu sao kê). */
  async settle(id: string, actorId: string): Promise<PaymentIntent> {
    const intent = await this.findById(id);

    if (intent.status === PaymentIntentStatus.SETTLED) {
      return intent;
    }
    if (intent.status !== PaymentIntentStatus.CAPTURED) {
      throw new BadRequestException(
        `Chỉ giao dịch đã thu tiền mới đánh dấu về tài khoản (đang ở trạng thái "${PAYMENT_INTENT_STATUS_LABELS[intent.status]}")`,
      );
    }

    intent.status = PaymentIntentStatus.SETTLED;
    intent.settledAt = new Date();
    const saved = await this.intents.save(intent);

    this.logger.log(`Giao dịch ${intent.code} đã về tài khoản (${actorId})`);
    return this.findById(saved.id);
  }

  // ------------------------------------------------------------ nhận webhook

  /**
   * Áp kết quả từ webhook provider.
   *
   * `resourceRef` là id intent (hai bên cùng biết). Số tiền trong payload được
   * **đối chiếu** với intent: lệch tiền thì không ghi sổ theo payload — ghi
   * `amount_mismatch` để con người xử lý, vì hạch toán theo số provider nói mà
   * không kiểm tra là cách chắc chắn nhất để sổ sai.
   */
  async applyInboundEvent(
    input: InboundWebhookHandlerInput,
  ): Promise<{ applied: boolean; note?: string | null }> {
    const outcome = INBOUND_EVENT_OUTCOMES[input.eventType];
    if (!outcome) {
      return { applied: false, note: 'Sự kiện không thuộc thanh toán' };
    }

    const intent = await this.intents.findOne({
      where: { id: input.resourceRef },
    });
    if (!intent) {
      this.logger.warn(
        `Webhook ${input.eventType} trỏ tới intent không tồn tại: ${input.resourceRef}`,
      );
      return {
        applied: false,
        note: `Không tìm thấy giao dịch ${input.resourceRef}`,
      };
    }

    const data = asRecord(input.payload.data);
    const statedAmount = asText(data.amount);
    if (
      outcome === 'captured' &&
      statedAmount !== null &&
      !moneyEquals(intent.amount, statedAmount)
    ) {
      await this.exceptions.create({
        type: ReconciliationExceptionType.AMOUNT_MISMATCH,
        paymentIntentId: intent.id,
        externalRef: input.externalId,
        detail: {
          source: 'webhook',
          eventType: input.eventType,
          expectedAmount: intent.amount,
          statedAmount,
        },
      });
      this.logger.error(
        `Số tiền webhook (${statedAmount}) lệch intent ${intent.code} (${intent.amount}) — KHÔNG ghi sổ`,
      );
      return {
        applied: false,
        note: 'Số tiền trong sự kiện lệch intent — đã ghi ngoại lệ đối soát',
      };
    }

    const providerStatus =
      asText(data.providerStatus) ?? input.eventType.replace('payment.', '');
    const result: ProviderResult = {
      outcome,
      providerRef: asText(data.providerRef) ?? intent.providerRef,
      providerStatus,
      message: asText(data.message),
      raw: input.payload,
    };

    const applied = await this.applyProviderResult(
      intent,
      result,
      SYSTEM_ACTOR_ID,
      { externalRef: input.externalId, throwOnPostingFailure: false },
    );

    return {
      applied: true,
      note: applied.conflictRecorded
        ? 'Kết quả đến trễ mâu thuẫn trạng thái cuối — đã ghi ngoại lệ'
        : null,
    };
  }

  // -------------------------------------------------------------- nội bộ

  /** Gọi provider lúc tạo; **mọi** lỗi mạng/timeout đều thành `unknown`. */
  private async chargeWithProvider(intent: PaymentIntent): Promise<ProviderResult> {
    try {
      return await this.provider.charge({
        idempotencyKey: intent.idempotencyKey,
        amount: intent.amount,
        currency: intent.currency,
        method: intent.method,
        description: intent.description,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Gọi provider thất bại cho ${intent.code}: ${message} — giữ trạng thái chưa xác định, sẽ tra cứu lại`,
      );
      return {
        outcome: 'unknown',
        providerRef: null,
        providerStatus: 'transport_error',
        message,
        raw: null,
      };
    }
  }

  private async fetchFromProvider(intent: PaymentIntent): Promise<ProviderResult> {
    try {
      return await this.provider.fetch(intent.idempotencyKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tra cứu provider thất bại cho ${intent.code}: ${message}`,
      );
      return {
        outcome: 'unknown',
        providerRef: intent.providerRef,
        providerStatus: 'transport_error',
        message,
        raw: null,
      };
    }
  }

  /**
   * Áp một kết luận của provider vào intent — **điểm duy nhất** quyết định
   * trạng thái và việc ghi sổ.
   */
  private async applyProviderResult(
    intent: PaymentIntent,
    result: ProviderResult,
    actorId: string,
    context: ApplyContext,
  ): Promise<ApplyOutcome> {
    intent.providerRef = result.providerRef ?? intent.providerRef;
    intent.providerStatus = result.providerStatus;
    intent.lastCheckedAt = new Date();

    if (result.outcome === 'captured') {
      // Đã thu rồi ⇒ chỉ cập nhật dấu vết, tuyệt đối không ghi sổ lần hai.
      if (isCaptured(intent.status)) {
        return {
          intent: await this.intents.save(intent),
          outcome: result.outcome,
          posted: false,
          conflictRecorded: false,
        };
      }

      // Thất bại/hết hạn/hoàn tiền đã chốt mà giờ báo "đã thu" ⇒ mâu thuẫn.
      if (isFinalIntentStatus(intent.status)) {
        return {
          intent: await this.recordLateConflict(intent, result, context),
          outcome: result.outcome,
          posted: false,
          conflictRecorded: true,
        };
      }

      const posted = await this.postCapture(intent, actorId, context);
      return {
        intent: await this.intents.save(intent),
        outcome: result.outcome,
        posted,
        conflictRecorded: false,
      };
    }

    if (result.outcome === 'authorized') {
      if (canPollProvider(intent.status)) {
        intent.status = PaymentIntentStatus.AUTHORIZED;
      }
      return {
        intent: await this.intents.save(intent),
        outcome: result.outcome,
        posted: false,
        conflictRecorded: false,
      };
    }

    if (result.outcome === 'unknown') {
      // `authorized` là thông tin chắc chắn hơn "chưa biết" ⇒ không hạ cấp.
      if (intent.status !== PaymentIntentStatus.AUTHORIZED) {
        intent.status = PaymentIntentStatus.UNKNOWN;
      }
      return {
        intent: await this.intents.save(intent),
        outcome: result.outcome,
        posted: false,
        conflictRecorded: false,
      };
    }

    const incoming = this.outcomeStatus(result.outcome);

    if (isFinalIntentStatus(intent.status)) {
      if (intent.status === incoming) {
        return {
          intent: await this.intents.save(intent),
          outcome: result.outcome,
          posted: false,
          conflictRecorded: false,
        };
      }
      // `settled` là bước sau của `captured`: không phải mâu thuẫn.
      if (
        intent.status === PaymentIntentStatus.SETTLED &&
        incoming === PaymentIntentStatus.CAPTURED
      ) {
        return {
          intent: await this.intents.save(intent),
          outcome: result.outcome,
          posted: false,
          conflictRecorded: false,
        };
      }
      return {
        intent: await this.recordLateConflict(intent, result, context),
        outcome: result.outcome,
        posted: false,
        conflictRecorded: true,
      };
    }

    intent.status = incoming;
    return {
      intent: await this.intents.save(intent),
      outcome: result.outcome,
      posted: false,
      conflictRecorded: false,
    };
  }

  /**
   * Ghi sổ + chuyển `captured` trong **cùng transaction**.
   *
   * `source_id = intent.id` (không phải event id) để unique index
   * `(source_type, source_id)` bảo đảm **một bút toán cho một intent**, dù kết
   * quả đến từ webhook hay cron. Id sự kiện vẫn được lưu trong ngoại lệ/vết.
   */
  private async postCapture(
    intent: PaymentIntent,
    actorId: string,
    context: ApplyContext,
  ): Promise<boolean> {
    const cashAccount = await this.resolveCashAccount(intent);
    const partyAccount = await this.resolvePartyAccount(intent.direction);
    const isReceipt = intent.direction === PaymentDirection.RECEIPT;
    const amount = moneyToString(intent.amount);
    const description =
      intent.description ??
      `${PAYMENT_DIRECTION_LABELS[intent.direction]} ${intent.code}`;
    const capturedAt = new Date();

    const lines = isReceipt
      ? [
          { accountId: cashAccount.id, debit: amount, description },
          {
            accountId: partyAccount.id,
            credit: amount,
            partyId: intent.partyId,
            description,
          },
        ]
      : [
          {
            accountId: partyAccount.id,
            debit: amount,
            partyId: intent.partyId,
            description,
          },
          { accountId: cashAccount.id, credit: amount, description },
        ];

    try {
      await this.journals.postDocument(
        {
          date: intent.date,
          description,
          reference: intent.code,
          sourceType: SourceType.PROVIDER_EVENT,
          sourceId: intent.id,
          lines,
        },
        actorId,
        async (manager, entry) => {
          // Cập nhật intent trong **cùng** transaction với bút toán: không thể
          // có bút toán đã ghi mà intent còn `unknown` (hoặc ngược lại).
          await manager.update(PaymentIntent, intent.id, {
            status: PaymentIntentStatus.CAPTURED,
            journalEntryId: entry.id,
            capturedAt,
            providerRef: intent.providerRef,
            providerStatus: intent.providerStatus,
            lastCheckedAt: intent.lastCheckedAt,
            attempts: intent.attempts,
          });
          intent.status = PaymentIntentStatus.CAPTURED;
          intent.journalEntryId = entry.id;
          intent.capturedAt = capturedAt;
        },
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Đua nhau: payload khác (webhook vs cron) nhưng cùng intent ⇒ unique
      // index chặn bút toán thứ hai; nếu bản ghi kia đã captured, coi như xong.
      if (/duplicate key/i.test(message)) {
        const current = await this.intents.findOne({
          where: { id: intent.id },
        });
        if (current && isCaptured(current.status)) {
          Object.assign(intent, current);
          return false;
        }
      }

      if (context.throwOnPostingFailure) {
        throw error;
      }

      this.logger.error(
        `Không ghi sổ được giao dịch ${intent.code}: ${message} — giữ chưa xác định để tra cứu/leo thang`,
      );
      intent.status = PaymentIntentStatus.UNKNOWN;
      return false;
    }
  }

  private async recordLateConflict(
    intent: PaymentIntent,
    result: ProviderResult,
    context: ApplyContext,
  ): Promise<PaymentIntent> {
    const previousStatus = intent.status;

    await this.exceptions.create({
      type: ReconciliationExceptionType.LATE_EVENT_CONFLICT,
      paymentIntentId: intent.id,
      externalRef: context.externalRef,
      detail: {
        code: intent.code,
        previousStatus,
        incomingOutcome: result.outcome,
        providerRef: result.providerRef,
        providerStatus: result.providerStatus,
        message: result.message,
        source: context.externalRef ? 'webhook' : 'poll',
      },
    });

    this.logger.warn(
      `Kết quả đến trễ mâu thuẫn cho ${intent.code}: ${previousStatus} ← ${result.outcome} — KHÔNG ghi đè`,
    );

    // Không đổi trạng thái; chỉ lưu dấu vết provider và thời điểm kiểm tra.
    return this.intents.save(intent);
  }

  /**
   * Leo thang khi quá ngưỡng tra cứu mà vẫn chưa kết luận.
   *
   * Tạo **một** ngoại lệ (chống trùng theo intent) + thông báo cho người ghi
   * sổ, rồi đặt `escalationNotifiedAt` để cron **ngừng** gọi provider. Hệ thống
   * không được tự suy diễn thất bại chỉ vì provider im lặng.
   */
  private async maybeEscalate(intent: PaymentIntent): Promise<boolean> {
    if (
      isFinalIntentStatus(intent.status) ||
      intent.escalationNotifiedAt ||
      intent.attempts < maxPollAttempts()
    ) {
      return false;
    }

    intent.escalationNotifiedAt = new Date();
    await this.intents.save(intent);

    await this.exceptions.create({
      type: ReconciliationExceptionType.UNRESOLVED_PROVIDER_STATUS,
      paymentIntentId: intent.id,
      externalRef: intent.id,
      detail: {
        code: intent.code,
        attempts: intent.attempts,
        provider: intent.provider,
        providerStatus: intent.providerStatus,
        providerRef: intent.providerRef,
        lastCheckedAt: intent.lastCheckedAt?.toISOString() ?? null,
      },
    });

    try {
      await this.notifications.create({
        type: NotificationType.SYSTEM,
        severity: NotificationSeverity.CRITICAL,
        audience: NotificationAudience.POSTER,
        title: `Giao dịch ${intent.code} chưa có kết luận sau ${intent.attempts} lần tra cứu`,
        body: [
          `Đã dừng tra cứu tự động để tránh gọi lại vô ích.`,
          `Provider: ${intent.provider} · trạng thái thô: ${intent.providerStatus ?? '—'}.`,
          `Cần xác minh với nhà cung cấp/sao kê rồi xử lý ngoại lệ đối soát.`,
        ].join('\n'),
        data: {
          paymentIntentId: intent.id,
          code: intent.code,
          attempts: intent.attempts,
          provider: intent.provider,
        },
      });
    } catch (error) {
      this.logger.error(
        `Không tạo được thông báo leo thang cho ${intent.code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return true;
  }

  private outcomeStatus(outcome: ProviderOutcome): PaymentIntentStatus {
    switch (outcome) {
      case 'captured':
        return PaymentIntentStatus.CAPTURED;
      case 'authorized':
        return PaymentIntentStatus.AUTHORIZED;
      case 'failed':
        return PaymentIntentStatus.FAILED;
      case 'refunded':
        return PaymentIntentStatus.REFUNDED;
      case 'expired':
        return PaymentIntentStatus.EXPIRED;
      default:
        return PaymentIntentStatus.UNKNOWN;
    }
  }

  /** Tài khoản tiền: khai trên intent, ngược lại suy theo phương thức. */
  private async resolveCashAccount(
    intent: Pick<PaymentIntent, 'cashAccountId' | 'method'>,
  ): Promise<{ id: string }> {
    if (intent.cashAccountId) {
      return this.accounts.getPostable(intent.cashAccountId);
    }

    const prefix = PAYMENT_METHOD_ACCOUNT_PREFIX[intent.method];
    if (!prefix) {
      throw new BadRequestException(
        `Phương thức "${PAYMENT_METHOD_LABELS[intent.method]}" không suy ra được tài khoản tiền — hãy khai cashAccountId trên giao dịch`,
      );
    }
    return this.accounts.requirePostableByCodePrefix(
      prefix,
      `tiền theo phương thức ${PAYMENT_METHOD_LABELS[intent.method]} (${prefix}*)`,
    );
  }

  private async resolvePartyAccount(
    direction: PaymentDirection,
  ): Promise<{ id: string }> {
    const isReceipt = direction === PaymentDirection.RECEIPT;
    return this.accounts.requirePostableByCodePrefix(
      isReceipt ? '131' : '331',
      isReceipt ? 'phải thu khách hàng (131*)' : 'phải trả người bán (331*)',
    );
  }

  private async nextCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `PI-${this.todayIso().replace(/-/g, '')}-${randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;
      if (!(await this.intents.exists({ where: { code } }))) {
        return code;
      }
    }
    throw new ConflictException('Không sinh được mã giao dịch — hãy thử lại');
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
