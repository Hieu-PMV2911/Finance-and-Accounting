import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';

import { Account } from '../accounts/entities/account.entity.js';
import { AccountType } from '../common/enums/account-type.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';
import {
  aggregateAccountMovements,
  LEDGER_STATUSES,
  resolveRange,
} from '../ledger/ledger-aggregate.util.js';
import { netBalanceOf } from '../ledger/ledger-balance.util.js';
import type { QueryReportDto } from './dto/query-report.dto.js';
import type {
  BalanceSheetView,
  CashFlowGroup,
  CashFlowGroupKey,
  CashFlowItem,
  CashFlowView,
  ProfitAndLossView,
  ReportAccountLine,
} from './interfaces/report-view.interface.js';

/**
 * Phân loại dòng tiền theo **mã tài khoản đối ứng** (phương pháp trực tiếp).
 *
 * Đây là cách phân loại rút gọn, đủ dùng cho bộ tài khoản TT200 cơ bản:
 * - Tiền & tương đương tiền: 111 (tiền mặt), 112 (tiền gửi ngân hàng), 113.
 * - Hoạt động đầu tư: 12x (đầu tư ngắn hạn), 21x–24x (TSCĐ, XDCB dở dang…).
 * - Hoạt động tài chính: 34x (vay), 41x (vốn chủ sở hữu), 42x (lợi nhuận),
 *   44x/46x (nguồn vốn).
 * - Còn lại → hoạt động kinh doanh.
 *
 * Phần mềm kế toán thương mại thường dùng **bảng ánh xạ** do kế toán trưởng cấu
 * hình thay vì suy từ tiền tố mã tài khoản; ở đây chọn cách suy từ tiền tố để
 * API chạy được ngay mà không cần thêm bảng cấu hình.
 */
const CASH_CODE_PATTERN = /^11/;
const INVESTING_CODE_PATTERN = /^(12|21|22|23|24)/;
const FINANCING_CODE_PATTERN = /^(34|41|42|44|46)/;

const CASH_FLOW_GROUP_LABELS: Record<CashFlowGroupKey, string> = {
  operating: 'Hoạt động kinh doanh',
  investing: 'Hoạt động đầu tư',
  financing: 'Hoạt động tài chính',
};

const CASH_FLOW_GROUP_ORDER: readonly CashFlowGroupKey[] = [
  'operating',
  'investing',
  'financing',
];

function isCashCode(code: string): boolean {
  return CASH_CODE_PATTERN.test(code);
}

function classifyCashFlow(code: string): CashFlowGroupKey {
  if (INVESTING_CODE_PATTERN.test(code)) return 'investing';
  if (FINANCING_CODE_PATTERN.test(code)) return 'financing';
  return 'operating';
}

function sumAmounts(lines: readonly ReportAccountLine[]): Decimal {
  return lines.reduce((acc, line) => acc.plus(toMoney(line.amount)), new Decimal(0));
}

function byAccountCode(a: ReportAccountLine, b: ReportAccountLine): number {
  return a.accountCode.localeCompare(b.accountCode);
}

/**
 * Báo cáo tài chính (mục 7): kết quả kinh doanh, bảng cân đối kế toán, lưu
 * chuyển tiền tệ.
 *
 * Mọi số liệu đều lấy từ bút toán **đã ghi sổ** (`journal_lines` của entry
 * `posted`/`reversed`) nên báo cáo luôn khớp với sổ cái và bảng cân đối số phát
 * sinh. Tiền tính bằng `decimal.js`, không dùng `number`.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(FiscalPeriod)
    private readonly periods: Repository<FiscalPeriod>,
  ) {}

  // ------------------------------------------------- kết quả kinh doanh

  /**
   * Kết quả kinh doanh (P&L) trong khoảng ngày.
   *
   * Chỉ lấy **phát sinh trong kỳ** (không cộng dư đầu kỳ) — đúng bản chất của
   * báo cáo kỳ. Doanh thu trình bày theo chiều Có (Có − Nợ), chi phí theo chiều
   * Nợ (Nợ − Có).
   */
  async profitAndLoss(query: QueryReportDto): Promise<ProfitAndLossView> {
    const range = await resolveRange(this.periods, query);
    const totals = await aggregateAccountMovements(this.lines, range);
    const byId = await this.accountIndex();

    const revenue: ReportAccountLine[] = [];
    const expense: ReportAccountLine[] = [];

    for (const item of totals.values()) {
      const account = byId.get(item.accountId);
      if (!account) continue;

      const netDebit = toMoney(item.debitTotal).minus(toMoney(item.creditTotal));

      if (account.type === AccountType.REVENUE) {
        const amount = netDebit.negated();
        if (amount.isZero()) continue;
        revenue.push(this.toLine(account, amount));
      } else if (account.type === AccountType.EXPENSE) {
        if (netDebit.isZero()) continue;
        expense.push(this.toLine(account, netDebit));
      }
    }

    revenue.sort(byAccountCode);
    expense.sort(byAccountCode);

    const revenueTotal = sumAmounts(revenue);
    const expenseTotal = sumAmounts(expense);
    const netProfit = revenueTotal.minus(expenseTotal);

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodId: range.period?.id ?? null,
      periodCode: range.period?.code ?? null,
      revenue: { lines: revenue, total: moneyToString(revenueTotal) },
      expense: { lines: expense, total: moneyToString(expenseTotal) },
      netProfit: moneyToString(netProfit),
      netProfitMargin: revenueTotal.greaterThan(0)
        ? netProfit.dividedBy(revenueTotal).times(100).toDecimalPlaces(2).toFixed(2)
        : null,
    };
  }

  // ------------------------------------------------------- bảng cân đối

  /**
   * Bảng cân đối kế toán tại `toDate`.
   *
   * Số dư từng tài khoản là **số dư thuần lũy kế** đến hết `toDate`. Phần
   * `retainedEarnings` = doanh thu lũy kế − chi phí lũy kế, cộng vào vốn chủ sở
   * hữu; nhờ vậy đẳng thức `Tài sản = Nợ phải trả + Vốn chủ sở hữu` luôn đúng
   * khi dữ liệu bút toán cân bằng.
   */
  async balanceSheet(query: QueryReportDto): Promise<BalanceSheetView> {
    const range = await resolveRange(this.periods, query);
    const totals = await aggregateAccountMovements(this.lines, range);
    const byId = await this.accountIndex();

    const assets: ReportAccountLine[] = [];
    const liabilities: ReportAccountLine[] = [];
    const equity: ReportAccountLine[] = [];
    let retainedEarnings = new Decimal(0);

    for (const item of totals.values()) {
      const account = byId.get(item.accountId);
      if (!account) continue;

      // Số dư thuần lũy kế: dương = dư Nợ, âm = dư Có.
      const net = netBalanceOf(item);

      switch (account.type) {
        case AccountType.ASSET:
          if (net.isZero()) continue;
          assets.push(this.toLine(account, net));
          break;
        case AccountType.LIABILITY:
          if (net.isZero()) continue;
          liabilities.push(this.toLine(account, net.negated()));
          break;
        case AccountType.EQUITY:
          if (net.isZero()) continue;
          equity.push(this.toLine(account, net.negated()));
          break;
        case AccountType.REVENUE:
          retainedEarnings = retainedEarnings.plus(net.negated());
          break;
        case AccountType.EXPENSE:
          retainedEarnings = retainedEarnings.minus(net);
          break;
      }
    }

    assets.sort(byAccountCode);
    liabilities.sort(byAccountCode);
    equity.sort(byAccountCode);

    const totalAssets = sumAmounts(assets);
    const totalLiabilities = sumAmounts(liabilities);
    const totalEquity = sumAmounts(equity);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity).plus(retainedEarnings);

    return {
      asOfDate: range.toDate,
      periodId: range.period?.id ?? null,
      periodCode: range.period?.code ?? null,
      assets: { lines: assets, total: moneyToString(totalAssets) },
      liabilities: { lines: liabilities, total: moneyToString(totalLiabilities) },
      equity: { lines: equity, total: moneyToString(totalEquity) },
      retainedEarnings: moneyToString(retainedEarnings),
      totalAssets: moneyToString(totalAssets),
      totalLiabilitiesAndEquity: moneyToString(totalLiabilitiesAndEquity),
      balanced: totalAssets.equals(totalLiabilitiesAndEquity),
    };
  }

  // --------------------------------------------------- lưu chuyển tiền tệ

  /**
   * Lưu chuyển tiền tệ theo **phương pháp trực tiếp**.
   *
   * Với mỗi bút toán có chạm tài khoản tiền, phần **đối ứng** (`Có − Nợ`) của
   * từng dòng chính là dòng tiền do tài khoản đó mang lại; tổng mọi dòng đối
   * ứng bằng đúng biến động tiền của bút toán (vì Σ Nợ = Σ Có). Nhờ vậy không
   * cần bảng ánh xạ riêng cho từng bút toán.
   */
  async cashFlow(query: QueryReportDto): Promise<CashFlowView> {
    const range = await resolveRange(this.periods, query);
    const totals = await aggregateAccountMovements(this.lines, range);
    const byId = await this.accountIndex();

    // Số dư tiền đầu kỳ = lũy kế thuần của các tài khoản tiền trước fromDate.
    let openingCash = new Decimal(0);
    for (const item of totals.values()) {
      const account = byId.get(item.accountId);
      if (!account || !isCashCode(account.code)) continue;
      openingCash = openingCash
        .plus(toMoney(item.openingDebit))
        .minus(toMoney(item.openingCredit));
    }

    const rows = await this.lines
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.entry', 'entry')
      .innerJoinAndSelect('line.account', 'account')
      .where('entry.status IN (:...statuses)', { statuses: LEDGER_STATUSES })
      .andWhere('entry.date >= :fromDate', { fromDate: range.fromDate })
      .andWhere('entry.date <= :toDate', { toDate: range.toDate })
      .getMany();

    const byEntry = new Map<string, JournalLine[]>();
    for (const line of rows) {
      const bucket = byEntry.get(line.entryId) ?? [];
      bucket.push(line);
      byEntry.set(line.entryId, bucket);
    }

    const buckets = new Map<
      CashFlowGroupKey,
      Map<string, { account: Account; amount: Decimal }>
    >(CASH_FLOW_GROUP_ORDER.map((key) => [key, new Map()]));

    for (const entryLines of byEntry.values()) {
      const touchesCash = entryLines.some(
        (line) => line.account && isCashCode(line.account.code),
      );
      if (!touchesCash) continue;

      for (const line of entryLines) {
        if (!line.account || isCashCode(line.account.code)) continue;

        // Dòng đối ứng: Có − Nợ. Tổng của mọi dòng đối ứng = biến động tiền.
        const contribution = toMoney(line.credit).minus(toMoney(line.debit));
        if (contribution.isZero()) continue;

        const bucket = buckets.get(classifyCashFlow(line.account.code));
        if (!bucket) continue;

        const current = bucket.get(line.accountId) ?? {
          account: line.account,
          amount: new Decimal(0),
        };
        current.amount = current.amount.plus(contribution);
        bucket.set(line.accountId, current);
      }
    }

    let netChange = new Decimal(0);
    const groups: CashFlowGroup[] = [];

    for (const key of CASH_FLOW_GROUP_ORDER) {
      const bucket = buckets.get(key) ?? new Map();
      const items: CashFlowItem[] = [];
      let inflow = new Decimal(0);
      let outflow = new Decimal(0);
      let net = new Decimal(0);

      for (const { account, amount } of bucket.values()) {
        if (amount.isZero()) continue;
        items.push({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          amount: moneyToString(amount),
        });
        if (amount.isPositive()) inflow = inflow.plus(amount);
        else outflow = outflow.plus(amount.negated());
        net = net.plus(amount);
      }

      items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
      netChange = netChange.plus(net);

      groups.push({
        key,
        label: CASH_FLOW_GROUP_LABELS[key],
        inflow: moneyToString(inflow),
        outflow: moneyToString(outflow),
        net: moneyToString(net),
        items,
      });
    }

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodId: range.period?.id ?? null,
      periodCode: range.period?.code ?? null,
      openingCash: moneyToString(openingCash),
      netChange: moneyToString(netChange),
      closingCash: moneyToString(openingCash.plus(netChange)),
      groups,
    };
  }

  // ------------------------------------------------------------- helpers

  private async accountIndex(): Promise<Map<string, Account>> {
    const accounts = await this.accounts.find();
    return new Map(accounts.map((account) => [account.id, account]));
  }

  private toLine(account: Account, amount: Decimal): ReportAccountLine {
    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      amount: moneyToString(amount),
    };
  }
}
