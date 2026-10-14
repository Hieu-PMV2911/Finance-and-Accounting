import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { moneyToString } from '../common/utils/money.util.js';
import { LEDGER_STATUSES } from '../ledger/ledger-aggregate.util.js';
import {
  INTEGRITY_CHECK_LABELS,
  INTEGRITY_CHECK_SEVERITY,
  IntegrityCheckCode,
  IntegritySeverity,
} from './enums/integrity.enum.js';
import type {
  IntegrityCheckResult,
  IntegrityViolation,
} from './interfaces/integrity.interface.js';

/** Số vi phạm tối đa lấy mẫu cho mỗi lượt kiểm tra (tránh payload khổng lồ). */
const MAX_SAMPLES = 50;

/** Mức độ nặng tăng dần — dùng để chọn `highestSeverity`. */
const SEVERITY_RANK: Record<IntegritySeverity, number> = {
  [IntegritySeverity.INFO]: 0,
  [IntegritySeverity.WARNING]: 1,
  [IntegritySeverity.CRITICAL]: 2,
};

/**
 * Bộ kiểm tra **bất biến nghiệp vụ** (mục 9 — "kiểm tra bất biến").
 *
 * Đây là lưới an toàn chạy định kỳ. Tầng service đã chặn vi phạm ngay khi thao
 * tác, nhưng dữ liệu vẫn có thể hỏng vì: bug, sửa tay trong DB, phục hồi từ
 * backup, hoặc migration sai. Job này đọc thẳng bảng và đối chiếu lại các bất
 * biến ở `AGENTS.md` mục 5:
 *
 * | Mã | Bất biến |
 * |---|---|
 * | `unbalanced-journal` | Σ Nợ = Σ Có cho mỗi bút toán |
 * | `balance-drift` | `account_balances` tái lập được từ `journal_lines` |
 * | `posted-in-frozen-period` | kỳ đã khóa/chốt không có bút toán ghi sổ |
 * | `orphan-journal-line` | dòng định khoản luôn có bút toán + tài khoản |
 * | `invalid-line-amount` | mỗi dòng chỉ Nợ XOR Có, không âm, không bằng 0 |
 * | `non-postable-account-usage` | chỉ ghi sổ vào tài khoản lá |
 * | `duplicate-entry-no` | số hiệu bút toán không trùng |
 *
 * Chỉ **đọc** — không tự sửa dữ liệu. Việc sửa (nếu cần) là thao tác riêng,
 * có người chịu trách nhiệm bấm.
 */
@Injectable()
export class IntegrityService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async run(periodId?: string | null): Promise<IntegrityCheckResult> {
    const scope = periodId ?? null;
    const ledgerStatuses = [...LEDGER_STATUSES];

    const [
      checkedJournals,
      unbalanced,
      drift,
      frozen,
      orphans,
      invalidAmounts,
      nonPostable,
      duplicates,
    ] = await Promise.all([
      this.countJournals(scope, ledgerStatuses),
      this.checkUnbalanced(scope, ledgerStatuses),
      this.checkBalanceDrift(scope, ledgerStatuses),
      this.checkFrozenPeriod(scope, ledgerStatuses),
      this.checkOrphanLines(),
      this.checkInvalidAmounts(scope, ledgerStatuses),
      this.checkNonPostable(scope, ledgerStatuses),
      this.checkDuplicateEntryNo(scope),
    ]);

    const violations = [
      ...unbalanced,
      ...drift,
      ...frozen,
      ...orphans,
      ...invalidAmounts,
      ...nonPostable,
      ...duplicates,
    ];

    const highest = violations.reduce<IntegritySeverity | null>(
      (acc, item) =>
        acc === null || SEVERITY_RANK[item.severity] > SEVERITY_RANK[acc]
          ? item.severity
          : acc,
      null,
    );

    const period = scope
      ? await this.dataSource.query<{ code: string }[]>(
          'SELECT code FROM fiscal_periods WHERE id = $1',
          [scope],
        )
      : [];

    return {
      checkedAt: new Date().toISOString(),
      periodId: scope,
      periodCode: period[0]?.code ?? null,
      checkedJournals,
      checksRun: 7,
      violationCount: violations.length,
      passed: violations.length === 0,
      highestSeverity: highest,
      violations,
    };
  }

  // ------------------------------------------------------------- kiểm tra

  private async countJournals(
    periodId: string | null,
    statuses: string[],
  ): Promise<number> {
    const rows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
         FROM journal_entries e
        WHERE e.status = ANY($2::text[])
          AND ($1::uuid IS NULL OR e.period_id = $1::uuid)`,
      [periodId, statuses],
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Bất biến 1: Σ Nợ = Σ Có (và tổng phải lớn hơn 0). */
  private async checkUnbalanced(
    periodId: string | null,
    statuses: string[],
  ): Promise<IntegrityViolation[]> {
    const rows = await this.dataSource.query<
      {
        id: string;
        entry_no: string | null;
        entry_date: Date | string;
        period_code: string | null;
        debit: string;
        credit: string;
      }[]
    >(
      `SELECT e.id,
              e.entry_no,
              e.entry_date,
              p.code AS period_code,
              COALESCE(SUM(l.debit), 0)  AS debit,
              COALESCE(SUM(l.credit), 0) AS credit
         FROM journal_entries e
         LEFT JOIN journal_lines l ON l.entry_id = e.id
         LEFT JOIN fiscal_periods p ON p.id = e.period_id
        WHERE e.status = ANY($2::text[])
          AND ($1::uuid IS NULL OR e.period_id = $1::uuid)
        GROUP BY e.id, e.entry_no, e.entry_date, p.code
       HAVING COALESCE(SUM(l.debit), 0) <> COALESCE(SUM(l.credit), 0)
           OR COALESCE(SUM(l.debit), 0) = 0
        ORDER BY e.entry_date DESC
        LIMIT $3`,
      [periodId, statuses, MAX_SAMPLES],
    );

    return rows.map((row) => ({
      code: IntegrityCheckCode.UNBALANCED_JOURNAL,
      severity: INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.UNBALANCED_JOURNAL],
      reference: row.entry_no ?? row.id,
      message: `Bút toán ${row.entry_no ?? row.id} có Σ Nợ (${moneyToString(row.debit)}) ≠ Σ Có (${moneyToString(row.credit)})`,
      details: {
        journalEntryId: row.id,
        entryNo: row.entry_no,
        entryDate: toIsoDate(row.entry_date),
        periodCode: row.period_code,
        totalDebit: moneyToString(row.debit),
        totalCredit: moneyToString(row.credit),
      },
    }));
  }

  /**
   * Bất biến 5: số dư trong `account_balances` phải bằng số dư tái lập từ
   * `journal_lines` của bút toán đã ghi sổ.
   *
   * Hai chiều lệch: (a) có phát sinh nhưng bảng số dư thiếu/khác; (b) bảng số dư
   * có số mà không có phát sinh nào tương ứng (dấu hiệu cộng/trừ sai).
   */
  private async checkBalanceDrift(
    periodId: string | null,
    statuses: string[],
  ): Promise<IntegrityViolation[]> {
    const missingOrDiff = await this.dataSource.query<
      {
        account_code: string;
        account_name: string;
        period_code: string | null;
        stored_debit: string | null;
        computed_debit: string;
        stored_credit: string | null;
        computed_credit: string;
      }[]
    >(
      `WITH computed AS (
         SELECT l.account_id,
                e.period_id,
                SUM(l.debit)  AS debit_total,
                SUM(l.credit) AS credit_total
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id
          WHERE e.status = ANY($2::text[])
            AND ($1::uuid IS NULL OR e.period_id = $1::uuid)
          GROUP BY l.account_id, e.period_id
       )
       SELECT a.code AS account_code,
              a.name AS account_name,
              p.code AS period_code,
              b.debit_total  AS stored_debit,
              c.debit_total  AS computed_debit,
              b.credit_total AS stored_credit,
              c.credit_total AS computed_credit
         FROM computed c
         JOIN accounts a ON a.id = c.account_id
         JOIN fiscal_periods p ON p.id = c.period_id
         LEFT JOIN account_balances b
                ON b.account_id = c.account_id AND b.period_id = c.period_id
        WHERE b.id IS NULL
           OR b.debit_total  <> c.debit_total
           OR b.credit_total <> c.credit_total
        ORDER BY a.code
        LIMIT $3`,
      [periodId, statuses, MAX_SAMPLES],
    );

    const orphanBalances = await this.dataSource.query<
      {
        account_code: string;
        account_name: string;
        period_code: string | null;
        debit_total: string;
        credit_total: string;
      }[]
    >(
      `SELECT a.code AS account_code,
              a.name AS account_name,
              p.code AS period_code,
              b.debit_total,
              b.credit_total
         FROM account_balances b
         JOIN accounts a ON a.id = b.account_id
         JOIN fiscal_periods p ON p.id = b.period_id
        WHERE (b.debit_total <> 0 OR b.credit_total <> 0)
          AND ($1::uuid IS NULL OR b.period_id = $1::uuid)
          AND NOT EXISTS (
                SELECT 1
                  FROM journal_lines l
                  JOIN journal_entries e ON e.id = l.entry_id
                 WHERE l.account_id = b.account_id
                   AND e.period_id = b.period_id
                   AND e.status = ANY($2::text[])
              )
        ORDER BY a.code
        LIMIT $3`,
      [periodId, statuses, MAX_SAMPLES],
    );

    const severity = INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.BALANCE_DRIFT];

    return [
      ...missingOrDiff.map((row) => ({
        code: IntegrityCheckCode.BALANCE_DRIFT,
        severity,
        reference: `Kỳ ${row.period_code ?? '?'} / TK ${row.account_code}`,
        message:
          row.stored_debit === null
            ? `Tài khoản ${row.account_code} có phát sinh nhưng thiếu dòng số dư`
            : `Số dư tài khoản ${row.account_code} lệch so với bút toán`,
        details: {
          accountCode: row.account_code,
          accountName: row.account_name,
          periodCode: row.period_code,
          storedDebit: row.stored_debit === null ? null : moneyToString(row.stored_debit),
          computedDebit: moneyToString(row.computed_debit),
          storedCredit: row.stored_credit === null ? null : moneyToString(row.stored_credit),
          computedCredit: moneyToString(row.computed_credit),
        },
      })),
      ...orphanBalances.map((row) => ({
        code: IntegrityCheckCode.BALANCE_DRIFT,
        severity,
        reference: `Kỳ ${row.period_code ?? '?'} / TK ${row.account_code}`,
        message: `Số dư tài khoản ${row.account_code} có số nhưng không có phát sinh tương ứng`,
        details: {
          accountCode: row.account_code,
          accountName: row.account_name,
          periodCode: row.period_code,
          storedDebit: moneyToString(row.debit_total),
          storedCredit: moneyToString(row.credit_total),
          computedDebit: moneyToString(0),
          computedCredit: moneyToString(0),
        },
      })),
    ];
  }

  /** Bất biến 3: kỳ đã khóa hoặc đã chốt không được có bút toán đã ghi sổ. */
  private async checkFrozenPeriod(
    periodId: string | null,
    statuses: string[],
  ): Promise<IntegrityViolation[]> {
    const rows = await this.dataSource.query<
      {
        id: string;
        entry_no: string | null;
        entry_date: Date | string;
        status: string;
        period_code: string;
        period_status: string;
      }[]
    >(
      `SELECT e.id,
              e.entry_no,
              e.entry_date,
              e.status,
              p.code   AS period_code,
              p.status AS period_status
         FROM journal_entries e
         JOIN fiscal_periods p ON p.id = e.period_id
        WHERE e.status = ANY($2::text[])
          AND p.status IN ('locked', 'closed')
          AND ($1::uuid IS NULL OR e.period_id = $1::uuid)
        ORDER BY e.entry_date DESC
        LIMIT $3`,
      [periodId, statuses, MAX_SAMPLES],
    );

    return rows.map((row) => ({
      code: IntegrityCheckCode.POSTED_IN_FROZEN_PERIOD,
      severity:
        INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.POSTED_IN_FROZEN_PERIOD],
      reference: row.entry_no ?? row.id,
      message: `Bút toán ${row.entry_no ?? row.id} đã ghi sổ trong kỳ ${row.period_code} đang ở trạng thái "${row.period_status}"`,
      details: {
        journalEntryId: row.id,
        entryNo: row.entry_no,
        entryDate: toIsoDate(row.entry_date),
        journalStatus: row.status,
        periodCode: row.period_code,
        periodStatus: row.period_status,
      },
    }));
  }

  /**
   * Dòng định khoản mồ côi: không có bút toán hoặc không có tài khoản.
   *
   * Không lọc theo kỳ: dòng mồ côi trỏ tới bút toán không tồn tại nên không có
   * kỳ để lọc — và ta cũng muốn thấy nó bất kể nó thuộc đâu.
   */
  private async checkOrphanLines(): Promise<IntegrityViolation[]> {
    const rows = await this.dataSource.query<
      {
        id: string;
        entry_id: string | null;
        account_id: string | null;
        line_no: number;
        entry_no: string | null;
      }[]
    >(
      `SELECT l.id,
              l.entry_id,
              l.account_id,
              l.line_no,
              e.entry_no
         FROM journal_lines l
         LEFT JOIN journal_entries e ON e.id = l.entry_id
         LEFT JOIN accounts a ON a.id = l.account_id
        WHERE e.id IS NULL OR a.id IS NULL
        LIMIT $1`,
      [MAX_SAMPLES],
    );

    return rows.map((row) => ({
      code: IntegrityCheckCode.ORPHAN_JOURNAL_LINE,
      severity:
        INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.ORPHAN_JOURNAL_LINE],
      reference: row.entry_no ?? row.id,
      message: `Dòng định khoản ${row.id} không gắn được bút toán hoặc tài khoản`,
      details: {
        journalLineId: row.id,
        journalEntryId: row.entry_id,
        accountId: row.account_id,
        lineNo: row.line_no,
      },
    }));
  }

  /** Bất biến 2: mỗi dòng chỉ Nợ XOR Có, số tiền không âm và không đồng thời bằng 0. */
  private async checkInvalidAmounts(
    periodId: string | null,
    statuses: string[],
  ): Promise<IntegrityViolation[]> {
    const rows = await this.dataSource.query<
      {
        id: string;
        entry_no: string | null;
        line_no: number;
        debit: string;
        credit: string;
      }[]
    >(
      `SELECT l.id,
              e.entry_no,
              l.line_no,
              l.debit,
              l.credit
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
        WHERE e.status = ANY($2::text[])
          AND ($1::uuid IS NULL OR e.period_id = $1::uuid)
          AND (l.debit < 0
            OR l.credit < 0
            OR (l.debit > 0 AND l.credit > 0)
            OR (l.debit = 0 AND l.credit = 0))
        ORDER BY e.entry_date DESC, l.line_no
        LIMIT $3`,
      [periodId, statuses, MAX_SAMPLES],
    );

    return rows.map((row) => ({
      code: IntegrityCheckCode.INVALID_LINE_AMOUNT,
      severity:
        INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.INVALID_LINE_AMOUNT],
      reference: `${row.entry_no ?? '?'} · dòng ${row.line_no}`,
      message: `Dòng ${row.line_no} của bút toán ${row.entry_no ?? '?'} sai quy tắc số tiền (Nợ ${moneyToString(row.debit)} / Có ${moneyToString(row.credit)})`,
      details: {
        journalLineId: row.id,
        entryNo: row.entry_no,
        lineNo: row.line_no,
        debit: moneyToString(row.debit),
        credit: moneyToString(row.credit),
      },
    }));
  }

  /** Bất biến 4: chỉ ghi sổ vào tài khoản lá (`is_postable = true`). */
  private async checkNonPostable(
    periodId: string | null,
    statuses: string[],
  ): Promise<IntegrityViolation[]> {
    const rows = await this.dataSource.query<
      {
        account_code: string;
        account_name: string;
        entry_no: string | null;
        entry_id: string;
      }[]
    >(
      `SELECT DISTINCT a.code AS account_code,
              a.name        AS account_name,
              e.entry_no,
              e.id          AS entry_id
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN accounts a ON a.id = l.account_id
        WHERE e.status = ANY($2::text[])
          AND a.is_postable = false
          AND ($1::uuid IS NULL OR e.period_id = $1::uuid)
        LIMIT $3`,
      [periodId, statuses, MAX_SAMPLES],
    );

    return rows.map((row) => ({
      code: IntegrityCheckCode.NON_POSTABLE_ACCOUNT_USAGE,
      severity:
        INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.NON_POSTABLE_ACCOUNT_USAGE],
      reference: `TK ${row.account_code}`,
      message: `Bút toán ${row.entry_no ?? '?'} ghi vào tài khoản không phải tài khoản lá (${row.account_code} — ${row.account_name})`,
      details: {
        accountCode: row.account_code,
        accountName: row.account_name,
        journalEntryId: row.entry_id,
        entryNo: row.entry_no,
      },
    }));
  }

  /** Số hiệu bút toán không được trùng. */
  private async checkDuplicateEntryNo(
    periodId: string | null,
  ): Promise<IntegrityViolation[]> {
    const rows = await this.dataSource.query<
      { entry_no: string; count: string; ids: string }[]
    >(
      `SELECT e.entry_no,
              COUNT(*)              AS count,
              STRING_AGG(e.id::text, ',') AS ids
         FROM journal_entries e
        WHERE e.entry_no IS NOT NULL
          AND ($1::uuid IS NULL OR e.period_id = $1::uuid)
        GROUP BY e.entry_no
       HAVING COUNT(*) > 1
        LIMIT $2`,
      [periodId, MAX_SAMPLES],
    );

    return rows.map((row) => ({
      code: IntegrityCheckCode.DUPLICATE_ENTRY_NO,
      severity:
        INTEGRITY_CHECK_SEVERITY[IntegrityCheckCode.DUPLICATE_ENTRY_NO],
      reference: row.entry_no,
      message: `Số hiệu bút toán ${row.entry_no} xuất hiện ${row.count} lần`,
      details: { entryNo: row.entry_no, count: Number(row.count), ids: row.ids.split(',') },
    }));
  }

  /** Nhãn hiển thị của một mã kiểm tra (dùng khi dựng thông báo/cảnh báo). */
  labelOf(code: IntegrityCheckCode): string {
    return INTEGRITY_CHECK_LABELS[code];
  }
}

/** `date` của Postgres có thể về dạng `Date` — chuẩn hóa về `YYYY-MM-DD`. */
function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
