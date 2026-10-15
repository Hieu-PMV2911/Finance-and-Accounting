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
  BILL_STATUS_LABELS,
  BillStatus,
  isBillImmutable,
} from '../common/enums/bill-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { moneyToString, sumMoney, toMoney } from '../common/utils/money.util.js';
import { isPartyAccount, partyAccountMessage } from '../common/utils/party-account.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import { PartiesService } from '../parties/parties.service.js';
import type { CreateVendorBillDto } from './dto/create-vendor-bill.dto.js';
import type { QueryVendorBillsDto } from './dto/query-vendor-bills.dto.js';
import type { UpdateVendorBillDto } from './dto/update-vendor-bill.dto.js';
import { VendorBill, VendorBillLine } from './entities/vendor-bill.entity.js';

@Injectable()
export class VendorBillsService {
  constructor(
    @InjectRepository(VendorBill)
    private readonly bills: Repository<VendorBill>,
    @InjectRepository(VendorBillLine)
    private readonly lines: Repository<VendorBillLine>,
    private readonly parties: PartiesService,
    private readonly accounts: AccountsService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async list(query: QueryVendorBillsDto = {}): Promise<VendorBill[]> {
    const qb = this.bills
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.party', 'party')
      .orderBy('bill.date', 'DESC')
      .addOrderBy('bill.billNo', 'DESC');

    if (query.partyId) qb.andWhere('bill.partyId = :partyId', { partyId: query.partyId });
    if (query.status) qb.andWhere('bill.status = :status', { status: query.status });
    if (query.billNo) qb.andWhere('bill.billNo ILIKE :billNo', { billNo: `%${query.billNo}%` });
    if (query.fromDate) qb.andWhere('bill.date >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate) qb.andWhere('bill.date <= :toDate', { toDate: query.toDate });

    return qb.getMany();
  }

  async findById(id: string): Promise<VendorBill> {
    const bill = await this.bills.findOne({ where: { id }, relations: { lines: true, party: true } });
    if (!bill) throw new NotFoundException('Không tìm thấy hóa đơn mua');
    return bill;
  }

  async create(dto: CreateVendorBillDto, actorId: string): Promise<VendorBill> {
    await this.parties.resolveActive(dto.partyId);

    const subtotal = toMoney(dto.subtotal);
    const tax = toMoney(dto.taxAmount ?? '0');
    const total = toMoney(dto.total);
    const lineTotal = sumMoney(dto.lines.map((l) => l.amount));
    if (!lineTotal.equals(subtotal)) throw new BadRequestException('Tổng dòng phải bằng subtotal');
    if (!subtotal.plus(tax).equals(total)) throw new BadRequestException('Subtotal + thuế phải bằng tổng tiền');

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      const acc = await this.accounts.getPostable(line.accountId);
      if (!acc.isActive) throw new BadRequestException(`Tài khoản ${acc.code} đã ngừng sử dụng`);
    }

    const bill = this.bills.create({
      billNo: dto.billNo.trim(),
      partyId: dto.partyId,
      date: dto.date,
      dueDate: dto.dueDate ?? null,
      description: dto.description ?? null,
      currency: dto.currency ?? 'VND',
      status: BillStatus.DRAFT,
      subtotal: moneyToString(subtotal),
      taxAmount: moneyToString(tax),
      total: moneyToString(total),
      payableAccountId: dto.payableAccountId ?? null,
      journalEntryId: null,
      createdBy: actorId,
      approvedBy: null,
      postedBy: null,
      postedAt: null,
    });

    const saved = await this.bills.save(bill);
    const lines = dto.lines.map((l, idx) =>
      this.lines.create({
        billId: saved.id,
        lineNo: idx + 1,
        accountId: l.accountId,
        description: l.description ?? null,
        quantity: moneyToString(l.quantity ?? '1.0000'),
        unitPrice: moneyToString(l.unitPrice ?? l.amount),
        amount: moneyToString(l.amount),
      }),
    );
    await this.lines.save(lines);
    return this.findById(saved.id);
  }

  // `_actorId` chưa dùng: vết thay đổi do `AuditSubscriber` ghi tự động theo ngữ cảnh
  // request. Giữ tham số để chữ ký khớp controller và P1.2 (duyệt/ghi sổ) dùng lại.
  async update(id: string, dto: UpdateVendorBillDto, _actorId: string): Promise<VendorBill> {
    const bill = await this.findById(id);
    if (isBillImmutable(bill.status)) throw new ForbiddenException('Không thể sửa hóa đơn mua đã ghi sổ hoặc đã hủy');

    if (dto.partyId) await this.parties.resolveActive(dto.partyId);

    Object.assign(bill, {
      billNo: dto.billNo ?? bill.billNo,
      partyId: dto.partyId ?? bill.partyId,
      date: dto.date ?? bill.date,
      dueDate: dto.dueDate ?? bill.dueDate,
      description: dto.description ?? bill.description,
      currency: dto.currency ?? bill.currency,
      payableAccountId: dto.payableAccountId ?? bill.payableAccountId,
    });

    if (dto.lines) {
      await this.lines.delete({ billId: bill.id });
      const lines = dto.lines.map((l, idx) =>
        this.lines.create({
          billId: bill.id,
          lineNo: idx + 1,
          accountId: l.accountId,
          description: l.description ?? null,
          quantity: moneyToString(l.quantity ?? '1.0000'),
          unitPrice: moneyToString(l.unitPrice ?? l.amount),
          amount: moneyToString(l.amount),
        }),
      );
      await this.lines.save(lines);
      if (dto.subtotal !== undefined) bill.subtotal = moneyToString(dto.subtotal);
      if (dto.taxAmount !== undefined) bill.taxAmount = moneyToString(dto.taxAmount);
      if (dto.total !== undefined) bill.total = moneyToString(dto.total);
    }

    return this.bills.save(bill);
  }

  async post(id: string, actorId: string): Promise<VendorBill> {
    const bill = await this.findById(id);

    // Vòng đời mục 10.A: draft | approved ──post──▶ posted.
    // (P1.2 của `MUC-10-TIEP-THEO.md` sẽ bổ sung bước `approved` + endpoint approve;
    // khi đó chỉ hóa đơn đã xác nhận mới ghi sổ được.)
    if (bill.status !== BillStatus.DRAFT && bill.status !== BillStatus.APPROVED) {
      throw new BadRequestException(
        `Hóa đơn mua đang ở trạng thái "${BILL_STATUS_LABELS[bill.status]}" — chỉ hóa đơn nháp hoặc đã xác nhận mới ghi sổ được`,
      );
    }

    // Tài khoản phải trả (công nợ nhà cung cấp): ưu tiên tài khoản đã khai trên hóa đơn,
    // nếu chưa khai thì lấy tài khoản lá 331* đang hoạt động.
    const payableAccount = bill.payableAccountId
      ? await this.accounts.getPostable(bill.payableAccountId)
      : await this.requireControlAccount('331', 'phải trả người bán (331*)');
    if (!isPartyAccount(payableAccount.code)) {
      throw new BadRequestException(partyAccountMessage(payableAccount.code));
    }

    // Bất biến số 3: chỉ kỳ đang mở mới nhận bút toán.
    const period = await this.periods.resolveByDate(bill.date);
    this.periods.assertAcceptsPostings(period);

    const lines = bill.lines || [];
    if (lines.length === 0) throw new BadRequestException('Hóa đơn mua không có dòng');

    const journalLines: CreateJournalLineDto[] = [];
    // Debit expense lines
    for (const line of lines) {
      journalLines.push({
        accountId: line.accountId,
        debit: moneyToString(line.amount),
        description: line.description ?? bill.description ?? `Hóa đơn mua ${bill.billNo}`,
      });
    }
    // Credit payable with party
    journalLines.push({
      accountId: payableAccount.id,
      credit: moneyToString(bill.total),
      partyId: bill.partyId,
      description: bill.description ?? `Hóa đơn mua ${bill.billNo}`,
    });

    const entry = await this.journals.create(
      {
        date: bill.date,
        description: bill.description ?? `Hóa đơn mua ${bill.billNo}`,
        reference: bill.billNo,
        sourceType: SourceType.VENDOR_BILL,
        sourceId: bill.id,
        lines: journalLines,
      },
      actorId,
    );

    const posted = await this.journals.post(entry.id, actorId);

    bill.status = BillStatus.POSTED;
    bill.journalEntryId = posted.id;
    bill.postedBy = actorId;
    bill.postedAt = new Date();
    bill.payableAccountId = payableAccount.id;

    await this.bills.save(bill);
    return bill;
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
