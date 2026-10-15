import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import type { Account } from '../accounts/entities/account.entity.js';
import { AllocationsService } from '../allocations/allocations.service.js';
import { AllocationSourceType } from '../common/enums/allocation-source-type.enum.js';
import {
  PAYMENT_DIRECTION_LABELS,
  PaymentDirection,
} from '../common/enums/payment-direction.enum.js';
import {
  PAYMENT_METHOD_ACCOUNT_PREFIX,
  PAYMENT_METHOD_LABELS,
} from '../common/enums/payment-method.enum.js';
import {
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
  isPaymentImmutable,
} from '../common/enums/payment-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import { JobTrigger } from '../jobs/enums/job.enum.js';
import { WebhookEventType } from '../jobs/enums/webhook.enum.js';
import { WebhooksService } from '../jobs/webhooks.service.js';
import { PartiesService } from '../parties/parties.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentsDto } from './dto/query-payments.dto.js';
import type { UpdatePaymentDto } from './dto/update-payment.dto.js';
import type { VoidPaymentDto } from './dto/void-payment.dto.js';
import { Payment } from './entities/payment.entity.js';

/**
 * Phiếu thu / phiếu chi (mục 10.A).
 *
 * Phiếu **không tự viết** Nợ/Có: khi ghi sổ nó gọi `JournalsService` để sinh bút toán
 * gắn `source_type = payment`. Nhờ vậy bút toán vẫn là bất biến, còn phiếu là chứng từ
 * nghiệp vụ có vòng đời riêng (`draft → approved → posted → voided`).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly parties: PartiesService,
    private readonly accounts: AccountsService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
    private readonly allocations: AllocationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async list(query: QueryPaymentsDto = {}): Promise<Payment[]> {
    const qb = this.payments
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.party', 'party')
      .orderBy('payment.date', 'DESC')
      .addOrderBy('payment.code', 'DESC');

    if (query.direction) {
      qb.andWhere('payment.direction = :direction', {
        direction: query.direction,
      });
    }
    if (query.status) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }
    if (query.method) {
      qb.andWhere('payment.method = :method', { method: query.method });
    }
    if (query.partyId) {
      qb.andWhere('payment.partyId = :partyId', { partyId: query.partyId });
    }
    if (query.fromDate) {
      qb.andWhere('payment.date >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('payment.date <= :toDate', { toDate: query.toDate });
    }
    if (query.search) {
      qb.andWhere(
        '(payment.code ILIKE :s OR payment.description ILIKE :s OR payment.reference ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<Payment> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: { party: true },
    });
    if (!payment) {
      throw new NotFoundException('Không tìm thấy phiếu thu/chi');
    }
    return payment;
  }

  async create(dto: CreatePaymentDto, actorId: string): Promise<Payment> {
    await this.parties.resolveActive(dto.partyId);

    const amount = toMoney(dto.amount);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('Số tiền phiếu phải lớn hơn 0');
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const code = dto.code.trim();
    await this.assertCodeAvailable(code);

    const payment = this.payments.create({
      code,
      direction: dto.direction,
      partyId: dto.partyId,
      date: dto.date,
      amount: moneyToString(amount),
      currency: dto.currency ?? 'VND',
      method: dto.method,
      reference: dto.reference?.trim() || null,
      description: dto.description?.trim() || null,
      cashAccountId: dto.cashAccountId ?? null,
      idempotencyKey,
      status: PaymentStatus.DRAFT,
      journalEntryId: null,
      reversalJournalEntryId: null,
      createdBy: actorId,
      approvedBy: null,
      approvedAt: null,
      postedBy: null,
      postedAt: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
    });

    try {
      const saved = await this.payments.save(payment);
      return this.findById(saved.id);
    } catch (error) {
      // Hai request đồng thời cùng khóa: bản ghi thắng đã tồn tại ⇒ trả về nó.
      if (idempotencyKey) {
        const existing = await this.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdatePaymentDto,
    actorId: string,
  ): Promise<Payment> {
    const payment = await this.findById(id);
    if (isPaymentImmutable(payment.status)) {
      throw new ForbiddenException(
        'Không thể sửa phiếu đã ghi sổ hoặc đã hủy',
      );
    }

    if (dto.code !== undefined && dto.code.trim() !== payment.code) {
      const code = dto.code.trim();
      await this.assertCodeAvailable(code, id);
      payment.code = code;
    }
    if (dto.partyId !== undefined) {
      await this.parties.resolveActive(dto.partyId);
      payment.partyId = dto.partyId;
    }
    if (dto.direction !== undefined) {
      payment.direction = dto.direction;
    }
    if (dto.date !== undefined) {
      payment.date = dto.date;
    }
    if (dto.amount !== undefined) {
      const amount = toMoney(dto.amount);
      if (!amount.greaterThan(0)) {
        throw new BadRequestException('Số tiền phiếu phải lớn hơn 0');
      }
      payment.amount = moneyToString(amount);
    }
    if (dto.currency !== undefined) {
      payment.currency = dto.currency;
    }
    if (dto.method !== undefined) {
      payment.method = dto.method;
    }
    if (dto.reference !== undefined) {
      payment.reference = dto.reference.trim() || null;
    }
    if (dto.description !== undefined) {
      payment.description = dto.description.trim() || null;
    }
    if (dto.cashAccountId !== undefined) {
      payment.cashAccountId = dto.cashAccountId;
    }
    if (dto.idempotencyKey !== undefined) {
      payment.idempotencyKey = dto.idempotencyKey.trim() || null;
    }

    payment.createdBy = payment.createdBy ?? actorId;
    await this.payments.save(payment);
    return this.findById(id);
  }

  /** `checker` xác nhận phiếu nháp → sẵn sàng ghi sổ. */
  async approve(id: string, actorId: string): Promise<Payment> {
    const payment = await this.findById(id);

    if (payment.status !== PaymentStatus.DRAFT) {
      throw new BadRequestException(
        `Chỉ xác nhận được phiếu nháp (phiếu đang ở trạng thái "${PAYMENT_STATUS_LABELS[payment.status]}")`,
      );
    }

    payment.status = PaymentStatus.APPROVED;
    payment.approvedBy = actorId;
    payment.approvedAt = new Date();
    await this.payments.save(payment);

    return this.findById(id);
  }

  /**
   * Ghi sổ phiếu — sinh bút toán qua `JournalsService`.
   *
   * - **Phiếu thu**: Nợ 111/112 · Có 131 (kèm đối tượng).
   * - **Phiếu chi**: Nợ 331 (kèm đối tượng) · Có 111/112.
   *
   * Ghi sổ lại là **idempotent** (đã posted ⇒ trả về chính nó), vì client retry không
   * được phép sinh bút toán thứ hai — hàng rào thứ hai là `UNIQUE(source_type, source_id)`.
   */
  async post(id: string, actorId: string): Promise<Payment> {
    const payment = await this.findById(id);

    if (payment.status === PaymentStatus.POSTED) {
      return payment;
    }
    if (payment.status !== PaymentStatus.APPROVED) {
      throw new BadRequestException(
        `Chỉ ghi sổ phiếu đã xác nhận (phiếu đang ở trạng thái "${PAYMENT_STATUS_LABELS[payment.status]}")`,
      );
    }

    // Bất biến số 3: chỉ kỳ đang mở mới nhận bút toán.
    const period = await this.periods.resolveByDate(payment.date);
    this.periods.assertAcceptsPostings(period);

    const cashAccount = await this.resolveCashAccount(payment);
    const isReceipt = payment.direction === PaymentDirection.RECEIPT;
    const partyAccount = await this.accounts.requirePostableByCodePrefix(
      isReceipt ? '131' : '331',
      isReceipt ? 'phải thu khách hàng (131*)' : 'phải trả người bán (331*)',
    );

    const amount = moneyToString(payment.amount);
    const description =
      payment.description ??
      `${PAYMENT_DIRECTION_LABELS[payment.direction]} ${payment.code}`;

    const lines: CreateJournalLineDto[] = isReceipt
      ? [
          { accountId: cashAccount.id, debit: amount, description },
          {
            accountId: partyAccount.id,
            credit: amount,
            partyId: payment.partyId,
            description,
          },
        ]
      : [
          {
            accountId: partyAccount.id,
            debit: amount,
            partyId: payment.partyId,
            description,
          },
          { accountId: cashAccount.id, credit: amount, description },
        ];

    const posted = await this.journals.postDocument(
      {
        date: payment.date,
        description,
        reference: payment.code,
        sourceType: SourceType.PAYMENT,
        sourceId: payment.id,
        lines,
      },
      actorId,
      // Cập nhật phiếu **trong cùng transaction** với bút toán (P1.2).
      async (manager, entry) => {
        await manager.update(Payment, payment.id, {
          status: PaymentStatus.POSTED,
          journalEntryId: entry.id,
          postedBy: actorId,
          postedAt: new Date(),
          cashAccountId: cashAccount.id,
        });
      },
    );

    payment.status = PaymentStatus.POSTED;
    payment.journalEntryId = posted.id;
    payment.postedBy = actorId;
    payment.postedAt = new Date();
    payment.cashAccountId = cashAccount.id;

    // Mục 10.A — phiếu vừa ghi sổ ⇒ phát `payment.posted`. Lỗi giao webhook không
    // làm hỏng kết quả ghi sổ đã commit (muốn bù: `POST /api/webhooks/events`).
    try {
      await this.webhooks.dispatch({
        eventType: WebhookEventType.PAYMENT_POSTED,
        resourceRef: payment.id,
        data: {
          code: payment.code,
          direction: payment.direction,
          method: payment.method,
          partyId: payment.partyId,
          date: payment.date,
          amount: payment.amount,
          currency: payment.currency,
          journalEntryId: posted.id,
        },
        trigger: JobTrigger.SYSTEM,
        actor: null,
      });
    } catch (error) {
      this.logger.error(
        `Không xếp được webhook payment.posted cho phiếu ${payment.code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.findById(id);
  }

  /**
   * Hủy phiếu.
   *
   * - Chưa ghi sổ (`draft`/`approved`): chỉ đổi trạng thái.
   * - Đã ghi sổ: sinh **bút toán đảo**; bút toán gốc không bị sửa (bất biến #2).
   * - Còn phân bổ: bị từ chối — công nợ phải được gỡ trỏ trước.
   */
  async voidPayment(
    id: string,
    dto: VoidPaymentDto,
    actorId: string,
  ): Promise<Payment> {
    const payment = await this.findById(id);

    if (payment.status === PaymentStatus.VOIDED) {
      throw new BadRequestException('Phiếu đã bị hủy');
    }

    const allocated = await this.allocations.allocatedFromSource(
      AllocationSourceType.PAYMENT,
      payment.id,
    );
    if (allocated.greaterThan(0)) {
      throw new ConflictException(
        `Phiếu đã được phân bổ ${moneyToString(allocated)} — hãy gỡ phân bổ trước khi hủy`,
      );
    }

    if (payment.status === PaymentStatus.POSTED) {
      if (!payment.journalEntryId) {
        throw new ConflictException(
          'Phiếu đã ghi sổ nhưng thiếu bút toán gốc — dữ liệu bất thường, cần kiểm tra thủ công',
        );
      }
      // Đảo bút toán **và** chuyển phiếu sang `voided` trong cùng transaction.
      const reversal = await this.journals.reverseDocument(
        payment.journalEntryId,
        { reason: dto.reason.trim(), date: dto.date },
        actorId,
        async (manager, created) => {
          await manager.update(Payment, payment.id, {
            status: PaymentStatus.VOIDED,
            voidedBy: actorId,
            voidedAt: new Date(),
            voidReason: dto.reason.trim(),
            reversalJournalEntryId: created.id,
          });
        },
      );
      payment.reversalJournalEntryId = reversal.id;
      payment.status = PaymentStatus.VOIDED;
      payment.voidedBy = actorId;
      payment.voidedAt = new Date();
      payment.voidReason = dto.reason.trim();
      return this.findById(id);
    }

    payment.status = PaymentStatus.VOIDED;
    payment.voidedBy = actorId;
    payment.voidedAt = new Date();
    payment.voidReason = dto.reason.trim();
    await this.payments.save(payment);

    return this.findById(id);
  }

  // ---------------------------------------------------------------- helpers

  private findByIdempotencyKey(key: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { idempotencyKey: key } });
  }

  /**
   * Tài khoản tiền để ghi sổ: dùng tài khoản đã khai trên phiếu, ngược lại suy ra theo
   * phương thức. Phương thức `other` **không** suy ra được ⇒ báo lỗi thay vì đoán bừa,
   * vì ghi nhầm tài khoản tiền là lỗi kế toán khó phát hiện.
   */
  private async resolveCashAccount(payment: Payment): Promise<Account> {
    if (payment.cashAccountId) {
      return this.accounts.getPostable(payment.cashAccountId);
    }

    const prefix = PAYMENT_METHOD_ACCOUNT_PREFIX[payment.method];
    if (!prefix) {
      throw new BadRequestException(
        `Phương thức "${PAYMENT_METHOD_LABELS[payment.method]}" không suy ra được tài khoản tiền — hãy khai cashAccountId trên phiếu`,
      );
    }

    return this.accounts.requirePostableByCodePrefix(
      prefix,
      `tiền theo phương thức ${PAYMENT_METHOD_LABELS[payment.method]} (${prefix}*)`,
    );
  }

  private async assertCodeAvailable(code: string, exceptId?: string): Promise<void> {
    const existing = await this.payments.findOne({ where: { code } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Số phiếu "${code}" đã tồn tại`);
    }
  }
}
