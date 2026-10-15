import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';

import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import { BillStatus } from '../common/enums/bill-status.enum.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { LEDGER_STATUSES, resolveRange } from '../ledger/ledger-aggregate.util.js';
import type { QueryReportDto } from './dto/query-report.dto.js';
import type { QueryAgingDto } from './dto/query-aging.dto.js';
import type {
  AgingBucket,
  AgingBucketKey,
  AgingLine,
  AgingPartyRow,
  AgingView,
  RevenueByPartyRow,
  RevenueByPartyView,
} from './interfaces/aging-view.interface.js';

/**
 * Tiền tố tài khoản **doanh thu** theo TT200 (511 — doanh thu bán hàng và cung cấp
 * dịch vụ). Muốn tách thêm (5111, 5113…) chỉ cần thêm tiền tố ở đây.
 */
const REVENUE_ACCOUNT_PREFIXES: readonly string[] = ['511'];

/** Định nghĩa nhóm tuổi nợ — thứ tự này là thứ tự hiển thị. */
const AGING_BUCKETS: readonly { key: AgingBucketKey; label: string }[] = [
  { key: 'not_due', label: 'Chưa đến hạn' },
  { key: 'overdue_1_30', label: 'Quá hạn 1–30 ngày' },
  { key: 'overdue_31_60', label: 'Quá hạn 31–60 ngày' },
  { key: 'overdue_61_90', label: 'Quá hạn 61–90 ngày' },
  { key: 'overdue_over_90', label: 'Quá hạn trên 90 ngày' },
  { key: 'no_due_date', label: 'Không có ngày đến hạn' },
];

interface DocumentRow {
  id: string;
  code: string;
  date: string;
  due_date: string | null;
  party_id: string;
  party_code: string;
  party_name: string;
  total: string;
  allocated: string;
}

interface RevenueRow {
  party_id: string;
  party_code: string;
  party_name: string;
  debit: string;
  credit: string;
  lines: string;
}

/** Số ngày giữa hai mốc `YYYY-MM-DD`, tính theo UTC để không lệch vì múi giờ. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function bucketOf(daysOverdue: number | null): AgingBucketKey {
  if (daysOverdue === null) {
    return 'no_due_date';
  }
  if (daysOverdue <= 0) {
    return 'not_due';
  }
  if (daysOverdue <= 30) {
    return 'overdue_1_30';
  }
  if (daysOverdue <= 60) {
    return 'overdue_31_60';
  }
  if (daysOverdue <= 90) {
    return 'overdue_61_90';
  }
  return 'overdue_over_90';
}

function emptyBuckets(): Record<AgingBucketKey, Decimal> {
  return AGING_BUCKETS.reduce(
    (acc, bucket) => ({ ...acc, [bucket.key]: new Decimal(0) }),
    {} as Record<AgingBucketKey, Decimal>,
  );
}

/**
 * Báo cáo **tuổi nợ** và **doanh thu theo đối tượng** (mục 10.A).
 *
 * Vì sao đọc bằng SQL trên `sales_invoices`/`allocations` thay vì bảng tổng hợp: số còn
 * lại của một hóa đơn là **dẫn xuất** (`total − Σ allocations`). Nếu lưu thành cột thì
 * mọi đường ghi phân bổ đều phải nhớ cập nhật nó, và sai một lần là công nợ lệch vĩnh
 * viễn. Đọc thẳng thì không có gì để lệch.
 *
 * Bất biến: **Σ nhóm = Σ outstanding từng dòng = `totalOutstanding`**.
 */
@Injectable()
export class AgingReportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(FiscalPeriod)
    private readonly periods: Repository<FiscalPeriod>,
  ) {}

  receivablesAging(query: QueryAgingDto = {}): Promise<AgingView> {
    return this.aging(AllocationTargetType.SALES_INVOICE, query);
  }

  payablesAging(query: QueryAgingDto = {}): Promise<AgingView> {
    return this.aging(AllocationTargetType.VENDOR_BILL, query);
  }

  /**
   * Doanh thu theo khách hàng trong một kỳ/khoảng ngày (mục 10.A).
   *
   * Chỉ tính các dòng định khoản **có gắn đối tượng** (`journal_lines.party_id`):
   * bán lẻ không gắn khách thì không quy được cho ai, nên `totalRevenue` ở đây là
   * doanh thu **theo khách hàng**, không hẳn bằng tổng doanh thu trên P&L.
   */
  async revenueByParty(query: QueryReportDto): Promise<RevenueByPartyView> {
    const range = await resolveRange(this.periods, query);

    const rows = await this.dataSource.query<RevenueRow[]>(
      `SELECT p.id AS party_id,
              p.code AS party_code,
              p.name AS party_name,
              COALESCE(SUM(l.debit), 0) AS debit,
              COALESCE(SUM(l.credit), 0) AS credit,
              COUNT(*) AS lines
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN accounts a ON a.id = l.account_id
         JOIN parties p ON p.id = l.party_id
        WHERE a.code LIKE ANY($3)
          AND e.status::text = ANY($4)
          AND e.entry_date BETWEEN $1 AND $2
        GROUP BY p.id, p.code, p.name
        ORDER BY p.code`,
      [
        range.fromDate,
        range.toDate,
        REVENUE_ACCOUNT_PREFIXES.map((prefix) => `${prefix}%`),
        [...LEDGER_STATUSES],
      ],
    );

    const mapped: RevenueByPartyRow[] = rows.map((row) => {
      // Doanh thu là tài khoản bên Có ⇒ thuần = Có − Nợ (bút toán đảo sẽ trừ ngược lại).
      const revenue = toMoney(row.credit).minus(toMoney(row.debit));
      return {
        partyId: row.party_id,
        partyCode: row.party_code,
        partyName: row.party_name,
        revenue: moneyToString(revenue),
        journalLines: Number(row.lines),
      };
    });

    const total = mapped.reduce(
      (sum, row) => sum.plus(toMoney(row.revenue)),
      new Decimal(0),
    );

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      totalRevenue: moneyToString(total),
      rows: mapped,
    };
  }

  // ---------------------------------------------------------------- helpers

  private async aging(
    targetType: AllocationTargetType,
    query: QueryAgingDto,
  ): Promise<AgingView> {
    const asOfDate = query.asOfDate ?? new Date().toISOString().slice(0, 10);
    const meta = AGING_SOURCE[targetType];

    const params: unknown[] = [meta.postedStatus, targetType];
    let partyFilter = '';
    if (query.partyId) {
      params.push(query.partyId);
      partyFilter = ` AND d.party_id = $${params.length}`;
    }

    const rows = await this.dataSource.query<DocumentRow[]>(
      `SELECT d.id,
              d.${meta.codeColumn} AS code,
              d.date,
              d.due_date,
              d.party_id,
              p.code AS party_code,
              p.name AS party_name,
              d.total,
              COALESCE(al.allocated, 0) AS allocated
         FROM ${meta.table} d
         JOIN parties p ON p.id = d.party_id
         LEFT JOIN (
           SELECT target_id, SUM(amount) AS allocated
             FROM allocations
            WHERE target_type = $2
            GROUP BY target_id
         ) al ON al.target_id = d.id
        WHERE d.status = $1${partyFilter}
        ORDER BY d.due_date NULLS FIRST, d.${meta.codeColumn}`,
      params,
    );

    const lines: AgingLine[] = [];
    const bucketTotals = emptyBuckets();
    const byParty = new Map<string, AgingPartyRow & { sums: Record<AgingBucketKey, Decimal> }>();

    for (const row of rows) {
      const outstanding = toMoney(row.total).minus(toMoney(row.allocated));
      if (!query.includeSettled && !outstanding.greaterThan(0)) {
        continue;
      }

      const daysOverdue = row.due_date ? daysBetween(row.due_date, asOfDate) : null;
      const bucket = bucketOf(daysOverdue);

      lines.push({
        targetType,
        targetId: row.id,
        code: row.code,
        partyId: row.party_id,
        partyCode: row.party_code,
        partyName: row.party_name,
        date: row.date,
        dueDate: row.due_date,
        total: moneyToString(toMoney(row.total)),
        allocated: moneyToString(toMoney(row.allocated)),
        outstanding: moneyToString(outstanding),
        daysOverdue,
        bucket,
      });

      bucketTotals[bucket] = bucketTotals[bucket].plus(outstanding);

      const existing = byParty.get(row.party_id) ?? {
        partyId: row.party_id,
        partyCode: row.party_code,
        partyName: row.party_name,
        buckets: {} as Record<AgingBucketKey, string>,
        total: '0',
        sums: emptyBuckets(),
      };
      existing.sums[bucket] = existing.sums[bucket].plus(outstanding);
      byParty.set(row.party_id, existing);
    }

    const parties: AgingPartyRow[] = [...byParty.values()]
      .map((party) => {
        const buckets = {} as Record<AgingBucketKey, string>;
        let total = new Decimal(0);
        for (const bucket of AGING_BUCKETS) {
          buckets[bucket.key] = moneyToString(party.sums[bucket.key]);
          total = total.plus(party.sums[bucket.key]);
        }
        return {
          partyId: party.partyId,
          partyCode: party.partyCode,
          partyName: party.partyName,
          buckets,
          total: moneyToString(total),
        };
      })
      .sort((left, right) => left.partyCode.localeCompare(right.partyCode, 'vi'));

    const buckets: AgingBucket[] = AGING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      amount: moneyToString(bucketTotals[bucket.key]),
    }));

    const totalOutstanding = buckets.reduce(
      (sum, bucket) => sum.plus(toMoney(bucket.amount)),
      new Decimal(0),
    );

    return {
      targetType,
      asOfDate,
      buckets,
      totalOutstanding: moneyToString(totalOutstanding),
      lines,
      parties,
    };
  }
}

/** Nguồn dữ liệu của báo cáo tuổi nợ — tên bảng/cột theo enum, không từ input. */
const AGING_SOURCE: Record<
  AllocationTargetType,
  { table: string; codeColumn: string; postedStatus: string }
> = {
  [AllocationTargetType.SALES_INVOICE]: {
    table: 'sales_invoices',
    codeColumn: 'invoice_no',
    postedStatus: InvoiceStatus.POSTED,
  },
  [AllocationTargetType.VENDOR_BILL]: {
    table: 'vendor_bills',
    codeColumn: 'bill_no',
    postedStatus: BillStatus.POSTED,
  },
};
