import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AccountDefaultsService } from '../account-defaults/account-defaults.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { AllocationsService } from '../allocations/allocations.service.js';
import type { Account } from '../accounts/entities/account.entity.js';
import { AccountDefaultScope } from '../common/enums/account-default-scope.enum.js';
import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import {
  INVOICE_STATUS_LABELS,
  InvoiceStatus,
  isInvoiceImmutable,
} from '../common/enums/invoice-status.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { JobTrigger } from '../jobs/enums/job.enum.js';
import { moneyToString, sumMoney, toMoney } from '../common/utils/money.util.js';
import { isPartyAccount, partyAccountMessage } from '../common/utils/party-account.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import { WebhookEventType } from '../jobs/enums/webhook.enum.js';
import { WebhooksService } from '../jobs/webhooks.service.js';
import { PartiesService } from '../parties/parties.service.js';
import type {
  CreateSalesInvoiceDto,
  CreateSalesInvoiceLineDto,
} from './dto/create-sales-invoice.dto.js';
import type { QuerySalesInvoicesDto } from './dto/query-sales-invoices.dto.js';
import type { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto.js';
import type { VoidSalesInvoiceDto } from './dto/void-sales-invoice.dto.js';
import { SalesInvoice, SalesInvoiceLine } from './entities/sales-invoice.entity.js';

@Injectable()
export class SalesInvoicesService {
  private readonly logger = new Logger(SalesInvoicesService.name);

  constructor(
    @InjectRepository(SalesInvoice)
    private readonly invoices: Repository<SalesInvoice>,
    @InjectRepository(SalesInvoiceLine)
    private readonly lines: Repository<SalesInvoiceLine>,
    private readonly parties: PartiesService,
    private readonly accounts: AccountsService,
    private readonly accountDefaults: AccountDefaultsService,
    private readonly allocations: AllocationsService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
    private readonly webhooks: WebhooksService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async list(query: QuerySalesInvoicesDto = {}): Promise<SalesInvoice[]> {
    const qb = this.invoices
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.party', 'party')
      .orderBy('invoice.date', 'DESC')
      .addOrderBy('invoice.invoiceNo', 'DESC');

    if (query.partyId) {
      qb.andWhere('invoice.partyId = :partyId', { partyId: query.partyId });
    }
    if (query.status) {
      qb.andWhere('invoice.status = :status', { status: query.status });
    }
    if (query.invoiceNo) {
      qb.andWhere('invoice.invoiceNo ILIKE :invoiceNo', { invoiceNo: `%${query.invoiceNo}%` });
    }
    if (query.fromDate) {
      qb.andWhere('invoice.date >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('invoice.date <= :toDate', { toDate: query.toDate });
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<SalesInvoice> {
    const invoice = await this.invoices.findOne({
      where: { id },
      relations: { lines: true, party: true },
    });
    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hóa đơn bán');
    }
    return invoice;
  }

  async create(dto: CreateSalesInvoiceDto, actor: AuthUser): Promise<SalesInvoice> {
    await this.parties.resolveActive(dto.partyId);

    const subtotal = toMoney(dto.subtotal);
    const tax = toMoney(dto.taxAmount ?? '0');
    const total = toMoney(dto.total);
    const lineTotal = sumMoney(dto.lines.map((l) => l.amount));
    if (!lineTotal.equals(subtotal)) {
      throw new BadRequestException('Tổng dòng phải bằng subtotal');
    }
    if (!subtotal.plus(tax).equals(total)) {
      throw new BadRequestException('Subtotal + thuế phải bằng tổng tiền');
    }

    // Mục 10.A — người lập thường **không** chọn tài khoản doanh thu; hệ thống giải
    // theo luật mặc định. Kết quả đã là tài khoản lá đang hoạt động.
    const lineAccounts = await this.resolveLineAccounts(dto.lines, actor);

    const invoice = this.invoices.create({
      invoiceNo: dto.invoiceNo.trim(),
      partyId: dto.partyId,
      date: dto.date,
      dueDate: dto.dueDate ?? null,
      description: dto.description ?? null,
      currency: dto.currency ?? 'VND',
      status: InvoiceStatus.DRAFT,
      subtotal: moneyToString(subtotal),
      taxAmount: moneyToString(tax),
      total: moneyToString(total),
      receivableAccountId: dto.receivableAccountId ?? null,
      journalEntryId: null,
      createdBy: actor.id,
      approvedBy: null,
      postedBy: null,
      postedAt: null,
    });

    const saved = await this.invoices.save(invoice);

    const lines = dto.lines.map((l, idx) => {
      return this.lines.create({
        invoiceId: saved.id,
        lineNo: idx + 1,
        accountId: lineAccounts[idx].id,
        description: l.description ?? null,
        quantity: moneyToString(l.quantity ?? '1.0000'),
        unitPrice: moneyToString(l.unitPrice ?? l.amount),
        amount: moneyToString(l.amount),
      });
    });
    await this.lines.save(lines);

    return this.findById(saved.id);
  }

  async update(
    id: string,
    dto: UpdateSalesInvoiceDto,
    actor: AuthUser,
  ): Promise<SalesInvoice> {
    const invoice = await this.findById(id);
    if (isInvoiceImmutable(invoice.status)) {
      throw new ForbiddenException('Không thể sửa hóa đơn đã ghi sổ hoặc đã hủy');
    }

    if (dto.partyId) {
      await this.parties.resolveActive(dto.partyId);
    }

    // Apply updates (simplified - for full impl need to recalc)
    Object.assign(invoice, {
      invoiceNo: dto.invoiceNo ?? invoice.invoiceNo,
      partyId: dto.partyId ?? invoice.partyId,
      date: dto.date ?? invoice.date,
      dueDate: dto.dueDate ?? invoice.dueDate,
      description: dto.description ?? invoice.description,
      currency: dto.currency ?? invoice.currency,
      receivableAccountId: dto.receivableAccountId ?? invoice.receivableAccountId,
    });

    if (dto.lines) {
      // Thay toàn bộ dòng ⇒ phải giải lại tài khoản cho từng dòng mới.
      const lineAccounts = await this.resolveLineAccounts(dto.lines, actor);
      await this.lines.delete({ invoiceId: invoice.id });
      const lines = dto.lines.map((l, idx) => {
        return this.lines.create({
          invoiceId: invoice.id,
          lineNo: idx + 1,
          accountId: lineAccounts[idx].id,
          description: l.description ?? null,
          quantity: moneyToString(l.quantity ?? '1.0000'),
          unitPrice: moneyToString(l.unitPrice ?? l.amount),
          amount: moneyToString(l.amount),
        });
      });
      await this.lines.save(lines);
      // Recalc totals if provided
      if (dto.subtotal !== undefined) invoice.subtotal = moneyToString(dto.subtotal);
      if (dto.taxAmount !== undefined) invoice.taxAmount = moneyToString(dto.taxAmount);
      if (dto.total !== undefined) invoice.total = moneyToString(dto.total);
    }

    return this.invoices.save(invoice);
  }

  /**
   * Hủy hóa đơn.
   *
   * - Chưa ghi sổ (`draft` / `approved`): chỉ đổi trạng thái — chưa có bút toán nào.
   * - Đã ghi sổ (`posted`): **không** sửa bút toán cũ (bất biến #2) mà sinh bút toán
   *   **đảo** qua `JournalsService.reverse`; bút toán gốc chuyển `reversed`, hóa đơn
   *   giữ nguyên số tiền và chuyển `voided`.
   *
   * Chứng từ điều chỉnh ở đây là **bút toán đảo** (đúng nghiệp vụ và giữ sổ cái cân
   * bằng). Một loại chứng từ `credit_note` riêng chưa được dựng — xem `MUC-10-TIEP-THEO.md`.
   */
  async voidInvoice(
    id: string,
    dto: VoidSalesInvoiceDto,
    actorId: string,
  ): Promise<SalesInvoice> {
    const invoice = await this.findById(id);

    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new BadRequestException('Hóa đơn đã bị hủy');
    }

    // Đã phân bổ thanh toán ⇒ phải gỡ phân bổ trước; nếu không, công nợ sẽ trỏ vào
    // một chứng từ không còn giá trị.
    const allocated = await this.allocations.allocatedToTarget(
      AllocationTargetType.SALES_INVOICE,
      invoice.id,
    );
    if (allocated.greaterThan(0)) {
      throw new ConflictException(
        `Hóa đơn đã được phân bổ ${moneyToString(allocated)} — hãy gỡ phân bổ trước khi hủy`,
      );
    }

    if (invoice.status === InvoiceStatus.POSTED) {
      if (!invoice.journalEntryId) {
        throw new ConflictException(
          'Hóa đơn đã ghi sổ nhưng thiếu bút toán gốc — dữ liệu bất thường, cần kiểm tra thủ công',
        );
      }
      // Đảo bút toán **và** chuyển hóa đơn sang `voided` trong cùng transaction:
      // nếu tách hai bước thì chạy lại sau sự cố sẽ gặp bút toán gốc đã `reversed`.
      const reversal = await this.journals.reverseDocument(
        invoice.journalEntryId,
        { reason: dto.reason.trim(), date: dto.date },
        actorId,
        async (manager, created) => {
          await manager.update(SalesInvoice, invoice.id, {
            status: InvoiceStatus.VOIDED,
            voidedBy: actorId,
            voidedAt: new Date(),
            voidReason: dto.reason.trim(),
            reversalJournalEntryId: created.id,
          });
        },
      );
      invoice.reversalJournalEntryId = reversal.id;
      invoice.status = InvoiceStatus.VOIDED;
      invoice.voidedBy = actorId;
      invoice.voidedAt = new Date();
      invoice.voidReason = dto.reason.trim();
      return this.findById(id);
    }

    invoice.status = InvoiceStatus.VOIDED;
    invoice.voidedBy = actorId;
    invoice.voidedAt = new Date();
    invoice.voidReason = dto.reason.trim();
    await this.invoices.save(invoice);

    return this.findById(id);
  }

  async post(id: string, actorId: string): Promise<SalesInvoice> {
    const invoice = await this.findById(id);

    // Vòng đời mục 10.A: draft | approved ──post──▶ posted.
    // (P1.2 của `MUC-10-TIEP-THEO.md` sẽ bổ sung bước `approved` + endpoint approve;
    // khi đó chỉ hóa đơn đã xác nhận mới ghi sổ được.)
    if (
      invoice.status !== InvoiceStatus.DRAFT &&
      invoice.status !== InvoiceStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Hóa đơn đang ở trạng thái "${INVOICE_STATUS_LABELS[invoice.status]}" — chỉ hóa đơn nháp hoặc đã xác nhận mới ghi sổ được`,
      );
    }

    // Tài khoản phải thu (công nợ khách hàng): ưu tiên tài khoản đã khai trên hóa đơn,
    // nếu chưa khai thì lấy tài khoản lá 131* đang hoạt động.
    const receivableAccount = invoice.receivableAccountId
      ? await this.accounts.getPostable(invoice.receivableAccountId)
      : await this.accounts.requirePostableByCodePrefix(
          '131',
          'phải thu khách hàng (131*)',
        );
    if (!isPartyAccount(receivableAccount.code)) {
      throw new BadRequestException(partyAccountMessage(receivableAccount.code));
    }

    // Bất biến số 3: chỉ kỳ đang mở mới nhận bút toán.
    const period = await this.periods.resolveByDate(invoice.date);
    this.periods.assertAcceptsPostings(period);

    const lines = invoice.lines || [];
    if (lines.length === 0) {
      throw new BadRequestException('Hóa đơn không có dòng');
    }

    // Bút toán: Nợ tài khoản phải thu (kèm đối tượng) / Có doanh thu theo từng dòng.
    const journalLines: CreateJournalLineDto[] = [];

    journalLines.push({
      accountId: receivableAccount.id,
      debit: moneyToString(invoice.total),
      partyId: invoice.partyId,
      description: invoice.description ?? `Hóa đơn ${invoice.invoiceNo}`,
    });

    // Credit revenue lines
    for (const line of lines) {
      journalLines.push({
        accountId: line.accountId,
        credit: moneyToString(line.amount),
        description: line.description ?? invoice.description ?? `Hóa đơn ${invoice.invoiceNo}`,
      });
    }

    const posted = await this.journals.postDocument(
      {
        date: invoice.date,
        description: invoice.description ?? `Hóa đơn bán ${invoice.invoiceNo}`,
        reference: invoice.invoiceNo,
        sourceType: SourceType.SALES_INVOICE,
        sourceId: invoice.id,
        lines: journalLines,
      },
      actorId,
      // Cập nhật hóa đơn **trong cùng transaction** với bút toán (P1.2): nếu ghi sổ
      // thất bại giữa chừng thì mọi thứ rollback — không để hóa đơn kẹt ở trạng thái
      // "bút toán đã ghi nhưng hóa đơn vẫn approved".
      async (manager, entry) => {
        await manager.update(SalesInvoice, invoice.id, {
          status: InvoiceStatus.POSTED,
          journalEntryId: entry.id,
          postedBy: actorId,
          postedAt: new Date(),
          receivableAccountId: receivableAccount.id,
        });
      },
    );

    invoice.status = InvoiceStatus.POSTED;
    invoice.journalEntryId = posted.id;
    invoice.postedBy = actorId;
    invoice.postedAt = new Date();
    invoice.receivableAccountId = receivableAccount.id;

    // Mục 10.A — phát sự kiện cho hệ thống ngoài. `resourceRef` = id hóa đơn nên
    // chống giao trùng theo `(sự kiện, hóa đơn, endpoint)`; hóa đơn đã ghi sổ là
    // bất biến (không post lại được) nên không có nguy cơ phát hai lần.
    // Lỗi giao webhook **không** được làm hỏng kết quả ghi sổ đã commit — đã ghi thì
    // phải trả 200; muốn bù sự kiện thì gọi `POST /api/webhooks/events`.
    try {
      await this.webhooks.dispatch({
        eventType: WebhookEventType.SALES_INVOICE_POSTED,
        resourceRef: invoice.id,
        data: {
          invoiceNo: invoice.invoiceNo,
          partyId: invoice.partyId,
          date: invoice.date,
          dueDate: invoice.dueDate,
          total: invoice.total,
          currency: invoice.currency,
          journalEntryId: posted.id,
        },
        trigger: JobTrigger.SYSTEM,
        actor: null,
      });
    } catch (error) {
      this.logger.error(
        `Không xếp được webhook sales_invoice.posted cho hóa đơn ${invoice.invoiceNo}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return invoice;
  }

  /** `checker` xác nhận hóa đơn nháp → sẵn sàng ghi sổ. */
  async approve(id: string, actorId: string): Promise<SalesInvoice> {
    const invoice = await this.findById(id);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Chỉ xác nhận được hóa đơn nháp (hóa đơn đang ở trạng thái "${INVOICE_STATUS_LABELS[invoice.status]}")`,
      );
    }

    invoice.status = InvoiceStatus.APPROVED;
    invoice.approvedBy = actorId;
    invoice.approvedAt = new Date();
    await this.invoices.save(invoice);

    return this.findById(id);
  }

  /**
   * Giải tài khoản doanh thu cho toàn bộ dòng hóa đơn (mục 10.A).
   * Tách riêng để `create` và `update` dùng **đúng một** quy tắc.
   */
  private resolveLineAccounts(
    lines: readonly CreateSalesInvoiceLineDto[],
    actor: AuthUser,
  ): Promise<Account[]> {
    return Promise.all(
      lines.map((line) =>
        this.accountDefaults.resolveLineAccount(
          {
            scope: AccountDefaultScope.SALES,
            category: line.category,
            overrideAccountId: line.accountId,
          },
          actor,
        ),
      ),
    );
  }
}
