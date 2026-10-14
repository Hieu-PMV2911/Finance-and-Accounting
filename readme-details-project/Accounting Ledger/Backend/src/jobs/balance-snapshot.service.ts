import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { LEDGER_STATUSES } from '../ledger/ledger-aggregate.util.js';

/** Kết quả một lần "chốt số dư" — lưu vào `job_runs.result`. */
export interface BalanceSnapshotSummary {
  periodId: string;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
  checkedAt: string;
  /** Số tài khoản có phát sinh hoặc có dòng số dư trong kỳ. */
  checkedAccounts: number;
  /** Số tài khoản bị lệch giữa `account_balances` và `journal_lines`. */
  driftCount: number;
  /** Số dòng số dư đã ghi lại (chỉ khi `repair = true`). */
  repairedCount: number;
  /** Σ phát sinh Nợ / Có tái lập từ bút toán — phải bằng nhau. */
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
  drift: {
    accountCode: string;
    accountName: string;
    storedDebit: string | null;
    computedDebit: string;
    storedCredit: string | null;
    computedCredit: string;
  }[];
}

interface BalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  computed_debit: string;
  computed_credit: string;
}

/**
 * Chốt số dư kỳ kế toán (mục 9 — "chốt số dư").
 *
 * Job này tái lập số dư **từ `journal_lines`** rồi đối chiếu với bảng tổng hợp
 * `account_balances`, và tổng hợp Σ phát sinh Nợ/Có của kỳ — tức là một bản
 * "chốt số dư" có thể đối chiếu độc lập, đúng tinh thần bất biến 5: số dư luôn
 * tái lập được từ bút toán.
 *
 * Mặc định **chỉ đọc**: lệch thì báo cáo, không tự sửa. Muốn ghi lại số dư phải
 * truyền `repair = true` — vì sửa dữ liệu số dư là thao tác nhạy cảm, phải có
 * người chịu trách nhiệm bấm. Khi ghi lại, chỉ cập nhật `debit_total`/
 * `credit_total`; **không** đụng tới `opening_debit`/`opening_credit` (số dư đầu
 * kỳ do kết chuyển khi chốt kỳ trước quyết định).
 */
@Injectable()
export class BalanceSnapshotService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async run(options: {
    periodId?: string | null;
    repair?: boolean;
  }): Promise<BalanceSnapshotSummary> {
    const period = await this.resolvePeriod(options.periodId);
    const statuses = [...LEDGER_STATUSES];

    const rows = await this.dataSource.query<BalanceRow[]>(
      `SELECT l.account_id,
              a.code AS account_code,
              a.name AS account_name,
              SUM(l.debit)  AS computed_debit,
              SUM(l.credit) AS computed_credit
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN accounts a ON a.id = l.account_id
        WHERE e.status = ANY($2::text[])
          AND e.period_id = $1
        GROUP BY l.account_id, a.code, a.name
        ORDER BY a.code`,
      [period.id, statuses],
    );

    const stored = await this.dataSource.query<
      {
        account_id: string;
        debit_total: string;
        credit_total: string;
      }[]
    >(
      `SELECT account_id, debit_total, credit_total
         FROM account_balances
        WHERE period_id = $1`,
      [period.id],
    );
    const storedByAccount = new Map(stored.map((row) => [row.account_id, row]));

    let totalDebit = toMoney(0);
    let totalCredit = toMoney(0);
    const drift: BalanceSnapshotSummary['drift'] = [];

    for (const row of rows) {
      const computedDebit = toMoney(row.computed_debit);
      const computedCredit = toMoney(row.computed_credit);
      totalDebit = totalDebit.plus(computedDebit);
      totalCredit = totalCredit.plus(computedCredit);

      const current = storedByAccount.get(row.account_id);
      const matches =
        current !== undefined &&
        toMoney(current.debit_total).equals(computedDebit) &&
        toMoney(current.credit_total).equals(computedCredit);

      if (!matches) {
        drift.push({
          accountCode: row.account_code,
          accountName: row.account_name,
          storedDebit: current ? moneyToString(current.debit_total) : null,
          computedDebit: moneyToString(computedDebit),
          storedCredit: current ? moneyToString(current.credit_total) : null,
          computedCredit: moneyToString(computedCredit),
        });
      }
    }

    let repairedCount = 0;
    if (options.repair && drift.length > 0) {
      repairedCount = await this.repair(period.id, rows);
    }

    return {
      periodId: period.id,
      periodCode: period.code,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      checkedAt: new Date().toISOString(),
      checkedAccounts: rows.length,
      driftCount: drift.length,
      repairedCount,
      totalDebit: moneyToString(totalDebit),
      totalCredit: moneyToString(totalCredit),
      balanced: totalDebit.equals(totalCredit),
      drift,
    };
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Xác định kỳ cần chốt: theo `periodId`, hoặc **kỳ đang mở chứa hôm nay**.
   * Không rõ kỳ thì báo lỗi rõ ràng thay vì đoán bừa.
   */
  private async resolvePeriod(periodId?: string | null): Promise<{
    id: string;
    code: string;
    startDate: string;
    endDate: string;
  }> {
    const params: unknown[] = [];
    let where = "status = 'open'";

    if (periodId) {
      where = 'id = $1';
      params.push(periodId);
    } else {
      where += ' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE';
    }

    const rows = await this.dataSource.query<
      { id: string; code: string; start_date: Date | string; end_date: Date | string }[]
    >(
      `SELECT id, code, start_date, end_date
         FROM fiscal_periods
        WHERE ${where}
        ORDER BY start_date DESC
        LIMIT 1`,
      params,
    );

    const row = rows[0];
    if (!row) {
      throw periodId
        ? new NotFoundException('Không tìm thấy kỳ kế toán')
        : new BadRequestException(
            'Hôm nay không thuộc kỳ kế toán nào đang mở — hãy tạo kỳ kế toán trước',
          );
    }

    return {
      id: row.id,
      code: row.code,
      startDate: toIsoDate(row.start_date),
      endDate: toIsoDate(row.end_date),
    };
  }

  /** Ghi lại `debit_total`/`credit_total` theo số liệu tái lập từ bút toán. */
  private async repair(periodId: string, rows: readonly BalanceRow[]): Promise<number> {
    let repaired = 0;
    for (const row of rows) {
      await this.dataSource.query(
        `INSERT INTO account_balances (account_id, period_id, debit_total, credit_total)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (account_id, period_id)
         DO UPDATE SET debit_total = EXCLUDED.debit_total,
                       credit_total = EXCLUDED.credit_total,
                       updated_at = now()`,
        [
          row.account_id,
          periodId,
          moneyToString(row.computed_debit),
          moneyToString(row.computed_credit),
        ],
      );
      repaired += 1;
    }
    return repaired;
  }
}

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
