import type { DataSource } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IntegrityCheckCode, IntegritySeverity } from './enums/integrity.enum.js';
import { IntegrityService } from './integrity.service.js';

/**
 * Bộ kiểm tra bất biến là **truy vấn thuần**: mỗi kiểm tra là một câu SQL trả về
 * danh sách vi phạm. Test này thay `DataSource` bằng một hàm khớp SQL → dữ liệu
 * giả, nhờ vậy kiểm chứng được phần *logic* của service (gộp vi phạm, chọn mức
 * độ nặng nhất, dựng thông điệp) mà không cần PostgreSQL.
 */
type QueryResult = Record<string, unknown>[];

interface Matcher {
  pattern: RegExp;
  rows: QueryResult;
}

function createDataSource(matches: Matcher[]): DataSource {
  const query = vi.fn(async (sql: string) => {
    const match = matches.find((item) => item.pattern.test(sql));
    if (!match) {
      throw new Error(`Không có dữ liệu giả cho câu SQL:\n${sql}`);
    }
    return match.rows;
  });

  return { query } as unknown as DataSource;
}

const COUNT_JOURNALS = /COUNT\(\*\) AS count\s+FROM journal_entries e\s+WHERE e.status = ANY/;
const UNBALANCED = /HAVING COALESCE\(SUM\(l\.debit\), 0\) <> COALESCE\(SUM\(l\.credit\), 0\)/;
const DRIFT_COMPUTED = /WITH computed AS/;
const DRIFT_ORPHAN = /FROM account_balances b\s+JOIN accounts a ON a\.id = b\.account_id/;
const FROZEN = /p\.status IN \('locked', 'closed'\)/;
const ORPHANS = /WHERE e\.id IS NULL OR a\.id IS NULL/;
const INVALID_AMOUNT = /l\.debit < 0/;
const NON_POSTABLE = /a\.is_postable = false/;
const DUPLICATE_NO = /STRING_AGG/;
const PERIOD_LOOKUP = /SELECT code FROM fiscal_periods WHERE id = \$1/;

/** Mọi kiểm tra đều sạch (không có vi phạm nào). */
function cleanMatches(): Matcher[] {
  return [
    { pattern: COUNT_JOURNALS, rows: [{ count: '42' }] },
    { pattern: UNBALANCED, rows: [] },
    { pattern: DRIFT_COMPUTED, rows: [] },
    { pattern: DRIFT_ORPHAN, rows: [] },
    { pattern: FROZEN, rows: [] },
    { pattern: ORPHANS, rows: [] },
    { pattern: INVALID_AMOUNT, rows: [] },
    { pattern: NON_POSTABLE, rows: [] },
    { pattern: DUPLICATE_NO, rows: [] },
    { pattern: PERIOD_LOOKUP, rows: [] },
  ];
}

describe('IntegrityService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('dữ liệu sạch ⇒ passed = true, không có vi phạm', async () => {
    const service = new IntegrityService(createDataSource(cleanMatches()));

    const result = await service.run();

    expect(result.passed).toBe(true);
    expect(result.violationCount).toBe(0);
    expect(result.highestSeverity).toBeNull();
    expect(result.checkedJournals).toBe(42);
    expect(result.checksRun).toBe(7);
    expect(result.periodId).toBeNull();
  });

  it('bút toán không cân bằng ⇒ vi phạm CRITICAL kèm số Nợ/Có', async () => {
    const matches = cleanMatches();
    matches[1] = {
      pattern: UNBALANCED,
      rows: [
        {
          id: 'j1',
          entry_no: 'JE-2026-01-0001',
          entry_date: '2026-01-31',
          period_code: '2026-01',
          debit: '100.0000',
          credit: '90.0000',
        },
      ],
    };

    const result = await new IntegrityService(createDataSource(matches)).run();

    expect(result.passed).toBe(false);
    expect(result.highestSeverity).toBe(IntegritySeverity.CRITICAL);
    const violation = result.violations.find(
      (item) => item.code === IntegrityCheckCode.UNBALANCED_JOURNAL,
    );
    expect(violation?.reference).toBe('JE-2026-01-0001');
    expect(violation?.details.totalDebit).toBe('100.0000');
    expect(violation?.details.totalCredit).toBe('90.0000');
    expect(violation?.message).toContain('≠');
  });

  it('số dư lệch ⇒ gộp cả hai chiều thiếu số dư và thừa số dư', async () => {
    const matches = cleanMatches();
    matches[2] = {
      pattern: DRIFT_COMPUTED,
      rows: [
        {
          account_code: '111',
          account_name: 'Tiền mặt',
          period_code: '2026-01',
          stored_debit: '10.0000',
          computed_debit: '20.0000',
          stored_credit: '0.0000',
          computed_credit: '0.0000',
        },
      ],
    };
    matches[3] = {
      pattern: DRIFT_ORPHAN,
      rows: [
        {
          account_code: '112',
          account_name: 'Tiền gửi ngân hàng',
          period_code: '2026-01',
          debit_total: '5.0000',
          credit_total: '0.0000',
        },
      ],
    };

    const result = await new IntegrityService(createDataSource(matches)).run();

    const drift = result.violations.filter(
      (item) => item.code === IntegrityCheckCode.BALANCE_DRIFT,
    );
    expect(drift).toHaveLength(2);
    expect(drift[0].message).toContain('lệch');
    expect(drift[1].message).toContain('không có phát sinh tương ứng');
    expect(result.highestSeverity).toBe(IntegritySeverity.CRITICAL);
  });

  it('chọn mức độ nặng nhất khi trộn nhiều loại vi phạm', async () => {
    const matches = cleanMatches();
    matches[7] = {
      pattern: NON_POSTABLE,
      rows: [
        {
          account_code: '1111',
          account_name: 'Tiền mặt VND',
          entry_no: 'JE-2026-01-0002',
          entry_id: 'j2',
        },
      ],
    };
    matches[8] = {
      pattern: DUPLICATE_NO,
      rows: [{ entry_no: 'JE-2026-01-0003', count: '2', ids: 'a,b' }],
    };

    const result = await new IntegrityService(createDataSource(matches)).run();

    expect(result.violationCount).toBe(2);
    // `non-postable` chỉ là WARNING, còn `duplicate-entry-no` là CRITICAL.
    expect(result.highestSeverity).toBe(IntegritySeverity.CRITICAL);
    expect(result.violations.map((item) => item.code)).toEqual([
      IntegrityCheckCode.NON_POSTABLE_ACCOUNT_USAGE,
      IntegrityCheckCode.DUPLICATE_ENTRY_NO,
    ]);
  });

  it('giới hạn theo kỳ ⇒ trả về mã kỳ đã kiểm tra', async () => {
    const matches = cleanMatches();
    matches[9] = { pattern: PERIOD_LOOKUP, rows: [{ code: '2026-02' }] };

    const result = await new IntegrityService(createDataSource(matches)).run(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.periodId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.periodCode).toBe('2026-02');
  });
});
