import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';

import { Account } from '../accounts/entities/account.entity.js';
import { normalBalanceOf } from '../common/enums/account-type.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';
import type { QueryGeneralLedgerDto } from './dto/query-general-ledger.dto.js';
import type { QueryReconciliationDto } from './dto/query-reconciliation.dto.js';
import type { QueryTrialBalanceDto } from './dto/query-trial-balance.dto.js';
import { AccountBalance } from './entities/account-balance.entity.js';
import type {
  GeneralLedgerLine,
  GeneralLedgerView,
  ReconciliationRow,
  ReconciliationView,
  TrialBalanceRow,
  TrialBalanceView,
} from './interfaces/ledger-view.interface.js';
import {
  aggregateAccountMovements,
  LEDGER_STATUSES,
  resolveRange,
} from './ledger-aggregate.util.js';
import { netBalanceOf, splitNet } from './ledger-balance.util.js';

/**
 * Read-model của sổ cái (mục 6).
 *
 * Toàn bộ số liệu được **tái lập từ `journal_lines`** của bút toán đã ghi sổ
 * chứ không đọc bảng tổng hợp, nhờ vậy:
 * - sổ cái tra được cho **mọi khoảng ngày**, kể cả khoảng cắt giữa kỳ;
 * - `trial-balance` luôn tự cân (`Σ dư cuối Nợ = Σ dư cuối Có`) nếu dữ liệu đúng;
 * - `reconciliation` có sẵn nguồn độc lập để đối chiếu với `account_balances`
 *   (bất biến của DEVELOPMENT_PLAN: "số dư tái lập được từ journal_lines").
 */
@Injectable()
export class LedgerQueryService {
  constructor(
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(FiscalPeriod)
    private readonly periods: Repository<FiscalPeriod>,
    @InjectRepository(AccountBalance)
    private readonly balances: Repository<AccountBalance>,
  ) {}

  // ------------------------------------------------------------ sổ cái

  /** Sổ cái chi tiết một tài khoản: số dư đầu kỳ → từng phát sinh → số dư cuối kỳ. */
  async generalLedger(query: QueryGeneralLedgerDto): Promise<GeneralLedgerView> {
    const account = await this.accounts.findOne({ where: { id: query.accountId } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const range = await resolveRange(this.periods, query);

    // Số dư đầu kỳ = lũy kế mọi bút toán đã ghi sổ TRƯỚC fromDate.
    const openingRow = await this.lines
      .createQueryBuilder('line')
      .innerJoin('line.entry', 'entry')
      .select('COALESCE(SUM(line.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(line.credit), 0)', 'credit')
      .where('line.accountId = :accountId', { accountId: account.id })
      .andWhere('entry.status IN (:...statuses)', { statuses: LEDGER_STATUSES })
      .andWhere('entry.date < :fromDate', { fromDate: range.fromDate })
      .getRawOne<{ debit: string; credit: string }>();

    const openingNet = toMoney(openingRow?.debit).minus(toMoney(openingRow?.credit));

    const rows = await this.lines
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.entry', 'entry')
      .where('line.accountId = :accountId', { accountId: account.id })
      .andWhere('entry.status IN (:...statuses)', { statuses: LEDGER_STATUSES })
      .andWhere('entry.date >= :fromDate', { fromDate: range.fromDate })
      .andWhere('entry.date <= :toDate', { toDate: range.toDate })
      .orderBy('entry.date', 'ASC')
      .addOrderBy('entry.entryNo', 'ASC')
      .addOrderBy('line.lineNo', 'ASC')
      .take(query.limit ?? 500)
      .skip(query.offset ?? 0)
      .getMany();

    let running = openingNet;
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    const lines: GeneralLedgerLine[] = [];

    for (const line of rows) {
      const debit = toMoney(line.debit);
      const credit = toMoney(line.credit);
      running = running.plus(debit).minus(credit);
      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);

      const balance = splitNet(running);
      lines.push({
        journalEntryId: line.entryId,
        entryNo: line.entry?.entryNo ?? null,
        date: line.entry?.date ?? '',
        description: line.entry?.description ?? '',
        reference: line.entry?.reference ?? null,
        lineDescription: line.description,
        debit: moneyToString(debit),
        credit: moneyToString(credit),
        balanceDebit: balance.debit,
        balanceCredit: balance.credit,
      });
    }

    const opening = splitNet(openingNet);
    const closing = splitNet(running);

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      normalBalance: normalBalanceOf(account.type),
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodId: range.period?.id ?? null,
      periodCode: range.period?.code ?? null,
      openingDebit: opening.debit,
      openingCredit: opening.credit,
      lines,
      totalDebit: moneyToString(totalDebit),
      totalCredit: moneyToString(totalCredit),
      closingDebit: closing.debit,
      closingCredit: closing.credit,
    };
  }

  // -------------------------------------------------------- trial balance

  /**
   * Bảng cân đối số phát sinh: dư đầu kỳ / phát sinh / dư cuối kỳ của **mọi tài
   * khoản có số dư**, kèm dòng tổng và cờ `balanced`.
   */
  async trialBalance(query: QueryTrialBalanceDto): Promise<TrialBalanceView> {
    const range = await resolveRange(this.periods, query);
    const totals = await aggregateAccountMovements(this.lines, range);
    const accounts = await this.accounts.find();
    const byId = new Map(accounts.map((account) => [account.id, account]));

    const rows: TrialBalanceRow[] = [];
    for (const item of totals.values()) {
      const account = byId.get(item.accountId);
      if (!account) continue;

      const opening = splitNet(
        toMoney(item.openingDebit).minus(toMoney(item.openingCredit)),
      );
      const closing = splitNet(netBalanceOf(item));

      // Bỏ qua tài khoản hoàn toàn không có số dư trong khoảng đang xét.
      if (
        opening.debit === '0.0000' &&
        opening.credit === '0.0000' &&
        closing.debit === '0.0000' &&
        closing.credit === '0.0000'
      ) {
        continue;
      }

      rows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        openingDebit: opening.debit,
        openingCredit: opening.credit,
        debitTotal: moneyToString(item.debitTotal),
        creditTotal: moneyToString(item.creditTotal),
        closingDebit: closing.debit,
        closingCredit: closing.credit,
      });
    }

    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const sum = (pick: (row: TrialBalanceRow) => string): Decimal =>
      rows.reduce((acc, row) => acc.plus(toMoney(pick(row))), new Decimal(0));

    const summary = {
      openingDebit: sum((row) => row.openingDebit),
      openingCredit: sum((row) => row.openingCredit),
      debitTotal: sum((row) => row.debitTotal),
      creditTotal: sum((row) => row.creditTotal),
      closingDebit: sum((row) => row.closingDebit),
      closingCredit: sum((row) => row.closingCredit),
    };

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodId: range.period?.id ?? null,
      periodCode: range.period?.code ?? null,
      rows,
      totals: {
        openingDebit: moneyToString(summary.openingDebit),
        openingCredit: moneyToString(summary.openingCredit),
        debitTotal: moneyToString(summary.debitTotal),
        creditTotal: moneyToString(summary.creditTotal),
        closingDebit: moneyToString(summary.closingDebit),
        closingCredit: moneyToString(summary.closingCredit),
      },
      balanced: summary.closingDebit.equals(summary.closingCredit),
    };
  }

  // ------------------------------------------------------- reconciliation

  /**
   * Đối chiếu `account_balances` (số dư đã lưu khi ghi sổ) với số dư **tái lập
   * từ `journal_lines`**. Lệch ⇒ dữ liệu số dư đã hỏng, cần điều tra.
   */
  async reconcile(query: QueryReconciliationDto): Promise<ReconciliationView> {
    const period = await this.periods.findOne({ where: { id: query.periodId } });
    if (!period) {
      throw new NotFoundException('Không tìm thấy kỳ kế toán');
    }

    const stored = await this.balances.find({
      where: { periodId: period.id },
      relations: { account: true },
    });

    const computed = await aggregateAccountMovements(this.lines, {
      fromDate: period.startDate,
      toDate: period.endDate,
    });

    const accounts = await this.accounts.find();
    const byId = new Map(accounts.map((account) => [account.id, account]));

    const storedByAccount = new Map(stored.map((row) => [row.accountId, row]));
    const accountIds = new Set<string>([
      ...storedByAccount.keys(),
      ...computed.keys(),
    ]);

    const differences: ReconciliationRow[] = [];

    for (const accountId of accountIds) {
      const storedRow = storedByAccount.get(accountId);
      const computedRow = computed.get(accountId);

      const storedOpeningNet = storedRow
        ? toMoney(storedRow.openingDebit).minus(toMoney(storedRow.openingCredit))
        : new Decimal(0);
      const computedOpeningNet = computedRow
        ? toMoney(computedRow.openingDebit).minus(toMoney(computedRow.openingCredit))
        : new Decimal(0);

      const storedDebitTotal = toMoney(storedRow?.debitTotal);
      const computedDebitTotal = toMoney(computedRow?.debitTotal);
      const storedCreditTotal = toMoney(storedRow?.creditTotal);
      const computedCreditTotal = toMoney(computedRow?.creditTotal);

      const mismatched: string[] = [];
      if (!storedOpeningNet.equals(computedOpeningNet)) mismatched.push('opening');
      if (!storedDebitTotal.equals(computedDebitTotal)) mismatched.push('debitTotal');
      if (!storedCreditTotal.equals(computedCreditTotal)) mismatched.push('creditTotal');

      if (mismatched.length === 0) continue;

      const account = byId.get(accountId);
      differences.push({
        accountId,
        accountCode: account?.code ?? '(không rõ)',
        accountName: account?.name ?? '(tài khoản đã bị xóa)',
        storedOpeningNet: moneyToString(storedOpeningNet),
        computedOpeningNet: moneyToString(computedOpeningNet),
        storedDebitTotal: moneyToString(storedDebitTotal),
        computedDebitTotal: moneyToString(computedDebitTotal),
        storedCreditTotal: moneyToString(storedCreditTotal),
        computedCreditTotal: moneyToString(computedCreditTotal),
        mismatched,
      });
    }

    differences.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return {
      periodId: period.id,
      periodCode: period.code,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      checkedAt: new Date().toISOString(),
      consistent: differences.length === 0,
      checkedAccounts: accountIds.size,
      differences,
    };
  }
}
