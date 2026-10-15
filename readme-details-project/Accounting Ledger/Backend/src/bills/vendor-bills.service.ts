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
  BILL_STATUS_LABELS,
  BillStatus,
  isBillImmutable,
} from '../common/enums/bill-status.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { moneyToString, sumMoney, toMoney } from '../common/utils/money.util.js';
import { isPartyAccount, partyAccountMessage } from '../common/utils/party-account.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import { JobTrigger } from '../jobs/enums/job.enum.js';
import { WebhookEventType } from '../jobs/enums/webhook.enum.js';
import { WebhooksService } from '../jobs/webhooks.service.js';
import { PartiesService } from '../parties/parties.service.js';
import type {
  CreateVendorBillDto,
  CreateVendorBillLineDto,
} from './dto/create-vendor-bill.dto.js';
import type { QueryVendorBillsDto } from './dto/query-vendor-bills.dto.js';
import type { UpdateVendorBillDto } from './dto/update-vendor-bill.dto.js';
import type { VoidVendorBillDto } from './dto/void-vendor-bill.dto.js';
import { VendorBill, VendorBillLine } from './entities/vendor-bill.entity.js';

@Injectable()
export class VendorBillsService {
  private readonly logger = new Logger(VendorBillsService.name);

  constructor(
    @InjectRepository(VendorBill)
    private readonly bills: Repository<VendorBill>,
    @InjectRepository(VendorBillLine)
    private readonly lines: Repository<VendorBillLine>,
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

  async create(dto: CreateVendorBillDto, actor: AuthUser): Promise<VendorBill> {
    await this.parties.resolveActive(dto.partyId);

    const subtotal = toMoney(dto.subtotal);
    const tax = toMoney(dto.taxAmount ?? '0');
    const total = toMoney(dto.total);
    const lineTotal = sumMoney(dto.lines.map((l) => l.amount));
    if (!lineTotal.equals(subtotal)) throw new BadRequestException('Tổng dòng phải bằng subtotal');
    if (!subtotal.plus(tax).equals(total)) throw new BadRequestException('Subtotal + thuế phải bằng tổng tiền');

    // Mục 10.A — người lập thường **không** chọn tài khoản chi phí; hệ thống giải
    // theo luật mặc định. Kết quả đã là tài khoản lá đang hoạt động.
    const lineAccounts = await this.resolveLineAccounts(dto.lines, actor);

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
      createdBy: actor.id,
      approvedBy: null,
      postedBy: null,
      postedAt: null,
    });

    const saved = await this.bills.save(bill);
    const lines = dto.lines.map((l, idx) =>
      this.lines.create({
        billId: saved.id,
        lineNo: idx + 1,
        accountId: lineAccounts[idx].id,
        description: l.description ?? null,
        quantity: moneyToString(l.quantity ?? '1.0000'),
        unitPrice: moneyToString(l.unitPrice ?? l.amount),
        amount: moneyToString(l.amount),
      }),
    );
    await this.lines.save(lines);
    return this.findById(saved.id);
  }

  async update(
    id: string,
    dto: UpdateVendorBillDto,
    actor: AuthUser,
  ): Promise<VendorBill> {
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
      // Thay toàn bộ dòng ⇒ phải giải lại tài khoản cho từng dòng mới.
      const lineAccounts = await this.resolveLineAccounts(dto.lines, actor);
      await this.lines.delete({ billId: bill.id });
      const lines = dto.lines.map((l, idx) =>
        this.lines.create({
          billId: bill.id,
          lineNo: idx + 1,
          accountId: lineAccounts[idx].id,
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

  /**
   * Hủy hóa đơn mua.
   *
   * - Chưa ghi sổ (`draft` / `approved`): chỉ đổi trạng thái.
   * - Đã ghi sổ (`posted`): sinh **bút toán đảo** qua `JournalsService.reverse`;
   *   bút toán gốc không bị sửa (bất biến #2).
   */
  async voidBill(
    id: string,
    dto: VoidVendorBillDto,
    actorId: string,
  ): Promise<VendorBill> {
    const bill = await this.findById(id);

    if (bill.status === BillStatus.VOIDED) {
      throw new BadRequestException('Hóa đơn mua đã bị hủy');
    }

    const allocated = await this.allocations.allocatedToTarget(
      AllocationTargetType.VENDOR_BILL,
      bill.id,
    );
    if (allocated.greaterThan(0)) {
      throw new ConflictException(
        `Hóa đơn mua đã được phân bổ ${moneyToString(allocated)} — hãy gỡ phân bổ trước khi hủy`,
      );
    }

    if (bill.status === BillStatus.POSTED) {
      if (!bill.journalEntryId) {
        throw new ConflictException(
          'Hóa đơn mua đã ghi sổ nhưng thiếu bút toán gốc — dữ liệu bất thường, cần kiểm tra thủ công',
        );
      }
      // Đảo bút toán **và** chuyển hóa đơn sang `voided` trong cùng transaction.
      const reversal = await this.journals.reverseDocument(
        bill.journalEntryId,
        { reason: dto.reason.trim(), date: dto.date },
        actorId,
        async (manager, created) => {
          await manager.update(VendorBill, bill.id, {
            status: BillStatus.VOIDED,
            voidedBy: actorId,
            voidedAt: new Date(),
            voidReason: dto.reason.trim(),
            reversalJournalEntryId: created.id,
          });
        },
      );
      bill.reversalJournalEntryId = reversal.id;
      bill.status = BillStatus.VOIDED;
      bill.voidedBy = actorId;
      bill.voidedAt = new Date();
      bill.voidReason = dto.reason.trim();
      return this.findById(id);
    }

    bill.status = BillStatus.VOIDED;
    bill.voidedBy = actorId;
    bill.voidedAt = new Date();
    bill.voidReason = dto.reason.trim();
    await this.bills.save(bill);

    return this.findById(id);
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
      : await this.accounts.requirePostableByCodePrefix(
          '331',
          'phải trả người bán (331*)',
        );
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

    const posted = await this.journals.postDocument(
      {
        date: bill.date,
        description: bill.description ?? `Hóa đơn mua ${bill.billNo}`,
        reference: bill.billNo,
        sourceType: SourceType.VENDOR_BILL,
        sourceId: bill.id,
        lines: journalLines,
      },
      actorId,
      // Cập nhật hóa đơn **trong cùng transaction** với bút toán (P1.2).
      async (manager, entry) => {
        await manager.update(VendorBill, bill.id, {
          status: BillStatus.POSTED,
          journalEntryId: entry.id,
          postedBy: actorId,
          postedAt: new Date(),
          payableAccountId: payableAccount.id,
        });
      },
    );

    bill.status = BillStatus.POSTED;
    bill.journalEntryId = posted.id;
    bill.postedBy = actorId;
    bill.postedAt = new Date();
    bill.payableAccountId = payableAccount.id;

    // Mục 10.A — phát sự kiện cho hệ thống ngoài (xem chú thích ở hóa đơn bán):
    // lỗi giao webhook không được làm hỏng kết quả ghi sổ đã commit.
    try {
      await this.webhooks.dispatch({
        eventType: WebhookEventType.VENDOR_BILL_POSTED,
        resourceRef: bill.id,
        data: {
          billNo: bill.billNo,
          partyId: bill.partyId,
          date: bill.date,
          dueDate: bill.dueDate,
          total: bill.total,
          currency: bill.currency,
          journalEntryId: posted.id,
        },
        trigger: JobTrigger.SYSTEM,
        actor: null,
      });
    } catch (error) {
      this.logger.error(
        `Không xếp được webhook vendor_bill.posted cho hóa đơn ${bill.billNo}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return bill;
  }

  /** `checker` xác nhận hóa đơn mua nháp → sẵn sàng ghi sổ. */
  async approve(id: string, actorId: string): Promise<VendorBill> {
    const bill = await this.findById(id);

    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException(
        `Chỉ xác nhận được hóa đơn mua nháp (hóa đơn đang ở trạng thái "${BILL_STATUS_LABELS[bill.status]}")`,
      );
    }

    bill.status = BillStatus.APPROVED;
    bill.approvedBy = actorId;
    bill.approvedAt = new Date();
    await this.bills.save(bill);

    return this.findById(id);
  }

  /**
   * Giải tài khoản chi phí cho toàn bộ dòng hóa đơn mua (mục 10.A).
   * Tách riêng để `create` và `update` dùng **đúng một** quy tắc.
   */
  private resolveLineAccounts(
    lines: readonly CreateVendorBillLineDto[],
    actor: AuthUser,
  ): Promise<Account[]> {
    return Promise.all(
      lines.map((line) =>
        this.accountDefaults.resolveLineAccount(
          {
            scope: AccountDefaultScope.PURCHASE,
            category: line.category,
            overrideAccountId: line.accountId,
          },
          actor,
        ),
      ),
    );
  }
}
