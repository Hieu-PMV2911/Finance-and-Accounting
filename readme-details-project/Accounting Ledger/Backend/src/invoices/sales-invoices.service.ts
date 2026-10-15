import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import type { Account } from '../accounts/entities/account.entity.js';
import {
  INVOICE_STATUS_LABELS,
  InvoiceStatus,
  isInvoiceImmutable,
} from '../common/enums/invoice-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { moneyToString, sumMoney, toMoney } from '../common/utils/money.util.js';
import { isPartyAccount, partyAccountMessage } from '../common/utils/party-account.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import { PartiesService } from '../parties/parties.service.js';
import type { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto.js';
import type { QuerySalesInvoicesDto } from './dto/query-sales-invoices.dto.js';
import type { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto.js';
import { SalesInvoice, SalesInvoiceLine } from './entities/sales-invoice.entity.js';

@Injectable()
export class SalesInvoicesService {
  constructor(
    @InjectRepository(SalesInvoice)
    private readonly invoices: Repository<SalesInvoice>,
    @InjectRepository(SalesInvoiceLine)
    private readonly lines: Repository<SalesInvoiceLine>,
    private readonly parties: PartiesService,
    private readonly accounts: AccountsService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
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

  async create(dto: CreateSalesInvoiceDto, actorId: string): Promise<SalesInvoice> {
    await this.parties.resolveActive(dto.partyId);

    // Basic validation
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

    // Validate each line account is postable
    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      const acc = await this.accounts.getPostable(line.accountId);
      if (!acc.isActive) {
        throw new BadRequestException(`Tài khoản ${acc.code} đã ngừng sử dụng`);
      }
    }

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
      createdBy: actorId,
      approvedBy: null,
      postedBy: null,
      postedAt: null,
    });

    const saved = await this.invoices.save(invoice);

    const lines = dto.lines.map((l, idx) => {
      return this.lines.create({
        invoiceId: saved.id,
        lineNo: idx + 1,
        accountId: l.accountId,
        description: l.description ?? null,
        quantity: moneyToString(l.quantity ?? '1.0000'),
        unitPrice: moneyToString(l.unitPrice ?? l.amount),
        amount: moneyToString(l.amount),
      });
    });
    await this.lines.save(lines);

    return this.findById(saved.id);
  }

  // `_actorId` chưa dùng: vết thay đổi do `AuditSubscriber` ghi tự động theo ngữ cảnh
  // request. Giữ tham số để chữ ký khớp controller và P1.2 (duyệt/ghi sổ) dùng lại.
  async update(id: string, dto: UpdateSalesInvoiceDto, _actorId: string): Promise<SalesInvoice> {
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
      await this.lines.delete({ invoiceId: invoice.id });
      const lines = dto.lines.map((l, idx) => {
        return this.lines.create({
          invoiceId: invoice.id,
          lineNo: idx + 1,
          accountId: l.accountId,
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
      : await this.requireControlAccount('131', 'phải thu khách hàng (131*)');
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

    const entry = await this.journals.create(
      {
        date: invoice.date,
        description: invoice.description ?? `Hóa đơn bán ${invoice.invoiceNo}`,
        reference: invoice.invoiceNo,
        sourceType: SourceType.SALES_INVOICE,
        sourceId: invoice.id,
        lines: journalLines,
      },
      actorId,
    );

    // Post it
    const posted = await this.journals.post(entry.id, actorId);

    invoice.status = InvoiceStatus.POSTED;
    invoice.journalEntryId = posted.id;
    invoice.postedBy = actorId;
    invoice.postedAt = new Date();
    invoice.receivableAccountId = receivableAccount.id;

    await this.invoices.save(invoice);
    return invoice;
  }

  /**
   * Lấy tài khoản công nợ để ghi sổ theo tiền tố mã.
   * Chặn khi chưa cấu hình tài khoản (không im lặng bỏ qua) và chỉ nhận tài khoản
   * **lá, đang hoạt động** qua `AccountsService.getPostable`.
   */
  private async requireControlAccount(prefix: string, label: string): Promise<Account> {
    const found = await this.accounts.findOneByCodePattern(prefix);
    if (!found) {
      throw new BadRequestException(
        `Không tìm thấy tài khoản ${label} để ghi sổ chứng từ`,
      );
    }
    return this.accounts.getPostable(found.id);
  }
}
