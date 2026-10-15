import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import type { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { AgingReportService } from './aging-report.service.js';
import { isOverdueBucket } from './interfaces/aging-view.interface.js';

/**
 * Tuổi nợ là **phép cộng có bất biến**: Σ các nhóm tuổi phải bằng Σ `outstanding`
 * của từng dòng. Test này dựng `DataSource` giả trả về đúng các cột mà SQL thật
 * trả (đã kiểm tên cột ở entity hóa đơn/phiếu), nhờ vậy kiểm chứng được:
 *
 * - hóa đơn rơi đúng nhóm theo `dueDate` tại `asOfDate`,
 * - `outstanding = total − Σ phân bổ`,
 * - chứng từ đã tất toán bị ẩn (trừ khi hỏi `includeSettled`),
 * - tổng theo nhóm khớp tổng theo dòng và theo đối tượng.
 *
 * Không thay `bucketOf` bằng bản sao: các ca dưới đây chọn mốc ngày ở **đúng biên**
 * của từng nhóm (30/31, 60/61, 90/91 ngày) nên nếu ngưỡng đổi thì test đỏ.
 */
const AS_OF = '2026-03-31';

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

/** Ngày `YYYY-MM-DD` lùi `days` ngày so với `AS_OF` — dùng để dựng mốc quá hạn. */
function daysBefore(days: number): string {
  const date = new Date(`${AS_OF}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function row(overrides: Partial<DocumentRow> & { id: string }): DocumentRow {
  return {
    code: `DOC-${overrides.id}`,
    date: '2026-01-01',
    due_date: null,
    party_id: 'party-1',
    party_code: 'KH001',
    party_name: 'Khách A',
    total: '0',
    allocated: '0',
    ...overrides,
  };
}

/** `DataSource` giả: ghi lại SQL đã gọi và trả dữ liệu theo bảng được hỏi. */
function createDataSource(rows: DocumentRow[]): {
  dataSource: DataSource;
  queries: string[];
} {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    return rows;
  });

  return { dataSource: { query } as unknown as DataSource, queries };
}

function createService(rows: DocumentRow[]): {
  service: AgingReportService;
  queries: string[];
} {
  const { dataSource, queries } = createDataSource(rows);
  const periods = {} as Repository<FiscalPeriod>;
  return { service: new AgingReportService(dataSource, periods), queries };
}

/** Tổng tiền của một nhóm tuổi trong kết quả. */
function bucketAmount(
  buckets: readonly { key: string; amount: string }[],
  key: string,
): string {
  return buckets.find((bucket) => bucket.key === key)?.amount ?? 'missing';
}

describe('AgingReportService — tuổi nợ phải thu', () => {
  const documents: DocumentRow[] = [
    // Quá hạn 16 ngày ⇒ nhóm 1–30.
    row({
      id: 'a',
      code: 'INV-A',
      due_date: daysBefore(16),
      total: '100',
      allocated: '40',
    }),
    // Chưa đến hạn.
    row({
      id: 'b',
      code: 'INV-B',
      due_date: '2026-05-01',
      party_id: 'party-2',
      party_code: 'KH002',
      party_name: 'Khách B',
      total: '200',
    }),
    // Đã tất toán (outstanding = 0) ⇒ mặc định bị ẩn.
    row({ id: 'c', code: 'INV-C', total: '50', allocated: '50' }),
    // Quá hạn 120 ngày ⇒ nhóm >90.
    row({
      id: 'd',
      code: 'INV-D',
      due_date: daysBefore(120),
      total: '300',
    }),
    // Không khai hạn thanh toán ⇒ nhóm riêng, KHÔNG phải nợ quá hạn.
    row({
      id: 'e',
      code: 'INV-E',
      party_id: 'party-2',
      party_code: 'KH002',
      party_name: 'Khách B',
      total: '60',
    }),
  ];

  it('rơi đúng nhóm tuổi, Σ nhóm = Σ dòng, và ẩn chứng từ đã tất toán', async () => {
    const { service } = createService(documents);

    const view = await service.receivablesAging({ asOfDate: AS_OF });

    expect(view.targetType).toBe(AllocationTargetType.SALES_INVOICE);
    expect(view.asOfDate).toBe(AS_OF);

    // INV-C bị ẩn (outstanding = 0); thứ tự dòng giữ nguyên như SQL trả về.
    expect(view.lines.map((line) => line.code)).toEqual([
      'INV-A',
      'INV-B',
      'INV-D',
      'INV-E',
    ]);

    expect(bucketAmount(view.buckets, 'not_due')).toBe('200.0000');
    expect(bucketAmount(view.buckets, 'overdue_1_30')).toBe('60.0000');
    expect(bucketAmount(view.buckets, 'overdue_over_90')).toBe('300.0000');
    expect(bucketAmount(view.buckets, 'no_due_date')).toBe('60.0000');
    expect(bucketAmount(view.buckets, 'overdue_31_60')).toBe('0.0000');
    expect(bucketAmount(view.buckets, 'overdue_61_90')).toBe('0.0000');

    // Bất biến số 1 của báo cáo.
    const sumBuckets = view.buckets.reduce(
      (sum, bucket) => sum + Number(bucket.amount),
      0,
    );
    expect(sumBuckets).toBe(620);
    expect(Number(view.totalOutstanding)).toBe(620);

    // Bất biến số 2: tổng theo đối tượng cũng bằng tổng số còn lại.
    const sumParties = view.parties.reduce(
      (sum, party) => sum + Number(party.total),
      0,
    );
    expect(sumParties).toBe(620);
    expect(view.parties.map((party) => party.partyCode)).toEqual([
      'KH001',
      'KH002',
    ]);
    expect(view.parties[1].buckets.no_due_date).toBe('60.0000');
  });

  it('dùng đúng biên nhóm 30/31 · 60/61 · 90/91 ngày', async () => {
    const { service } = createService([
      row({ id: '1', due_date: daysBefore(30), total: '1' }),
      row({ id: '2', due_date: daysBefore(31), total: '2' }),
      row({ id: '3', due_date: daysBefore(60), total: '4' }),
      row({ id: '4', due_date: daysBefore(61), total: '8' }),
      row({ id: '5', due_date: daysBefore(90), total: '16' }),
      row({ id: '6', due_date: daysBefore(91), total: '32' }),
      // Hạn đúng ngày báo cáo ⇒ chưa quá hạn.
      row({ id: '7', due_date: AS_OF, total: '64' }),
    ]);

    const view = await service.receivablesAging({ asOfDate: AS_OF });

    expect(bucketAmount(view.buckets, 'not_due')).toBe('64.0000');
    expect(bucketAmount(view.buckets, 'overdue_1_30')).toBe('1.0000');
    expect(bucketAmount(view.buckets, 'overdue_31_60')).toBe('6.0000');
    expect(bucketAmount(view.buckets, 'overdue_61_90')).toBe('24.0000');
    expect(bucketAmount(view.buckets, 'overdue_over_90')).toBe('32.0000');
    expect(Number(view.totalOutstanding)).toBe(127);
  });

  it('includeSettled hiện lại chứng từ đã tất toán nhưng không đổi tổng', async () => {
    const { service } = createService(documents);

    const view = await service.receivablesAging({
      asOfDate: AS_OF,
      includeSettled: true,
    });

    expect(view.lines).toHaveLength(5);
    expect(view.lines.find((line) => line.code === 'INV-C')?.outstanding).toBe(
      '0.0000',
    );
    expect(Number(view.totalOutstanding)).toBe(620);
  });

  it('lọc theo đối tượng được đẩy xuống SQL bằng tham số riêng', async () => {
    const { service, queries } = createService([]);

    await service.receivablesAging({
      asOfDate: AS_OF,
      partyId: '11111111-1111-4111-8111-111111111111',
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('AND d.party_id = $3');
  });

  it('phải trả đọc đúng bảng hóa đơn mua và cột số chứng từ', async () => {
    const { service, queries } = createService([]);

    const view = await service.payablesAging({ asOfDate: AS_OF });

    expect(view.targetType).toBe(AllocationTargetType.VENDOR_BILL);
    expect(queries[0]).toContain('FROM vendor_bills d');
    expect(queries[0]).toContain('d.bill_no AS code');
  });
});

describe('isOverdueBucket', () => {
  it('chỉ bốn nhóm quá hạn mới là nợ quá hạn', () => {
    expect(isOverdueBucket('overdue_1_30')).toBe(true);
    expect(isOverdueBucket('overdue_31_60')).toBe(true);
    expect(isOverdueBucket('overdue_61_90')).toBe(true);
    expect(isOverdueBucket('overdue_over_90')).toBe(true);
    expect(isOverdueBucket('not_due')).toBe(false);
    expect(isOverdueBucket('no_due_date')).toBe(false);
  });
});
