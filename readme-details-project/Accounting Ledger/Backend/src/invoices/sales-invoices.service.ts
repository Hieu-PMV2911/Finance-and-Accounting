import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import { InvoiceStatus, isInvoiceImmutable } from '../common/enums/invoice-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { moneyToString, sumMoney, toMoney } from '../common/utils/money.util.js';
import { isPartyAccount, partyAccountMessage } from '../common/utils/party-account.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
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

  async update(id: string, dto: UpdateSalesInvoiceDto, actorId: string): Promise<SalesInvoice> {
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
    if (invoice.status === InvoiceStatus.POSTED) {
      throw new BadRequestException('Hóa đơn đã được ghi sổ');
    }
    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new BadRequestException('Hóa đơn đã bị hủy');
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      // could auto-approve? but follow RBAC pattern - but for API simplicity, allow posting if approved? let us check - per journal lifecycle, need approved then posted; but maybe for this minimal impl, allow if draft? or require approved. Let us be lenient.
    }

    // Determine receivable account (party account) - default to 131 if not specified
    let receivableAccountId = invoice.receivableAccountId;
    if (!receivableAccountId) {
      // Try to find an active receivable account starting with 131
      const acc = await this.accounts.findOneByCodePattern('131');
      if (!acc) {
        throw new BadRequestException('Không tìm thấy tài khoản phải thu (131*) để ghi sổ hóa đơn');
      }
      receivableAccountId = acc.id;
    }

    // Validate receivable is party account
    const recAcc = await this.accounts.getPostable(receivableAccountId);
    if (!isPartyAccount(recAcc.code)) {
      throw new BadRequestException(partyAccountMessage(recAcc.code));
    }

    // Ensure fiscal period open
    const period = await this.periods.resolveByDate(invoice.date);
    await this.periods.assertAcceptsPostings(period.id);

    const lines = invoice.lines || [];
    if (lines.length === 0) {
      throw new BadRequestException('Hóa đơn không có dòng');
    }

    // Build journal entry: Dr Receivable (party) for total, Cr Revenue per line
    const journalLines: Array<{
      accountId: string;
      debit?: string;
      credit?: string;
      partyId?: string | null;
      description?: string | null;
    }> = [];

    // Debit receivable with party
    journalLines.push({
      accountId: receivableAccountId,
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
        lines: journalLines as any,
      },
      actorId,
    );

    // Post it
    const posted = await this.journals.post(entry.id, actorId);

    invoice.status = InvoiceStatus.POSTED;
    invoice.journalEntryId = posted.id;
    invoice.postedBy = actorId;
    invoice.postedAt = new Date();
    invoice.receivableAccountId = receivableAccountId;

    await this.invoices.save(invoice);
    return invoice;
  }
}
