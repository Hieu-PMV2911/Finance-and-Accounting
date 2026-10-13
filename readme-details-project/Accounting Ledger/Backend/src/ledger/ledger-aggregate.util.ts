import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { JournalStatus } from '../common/enums/journal-status.enum.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';

/**
 * Tiện ích dùng chung cho mọi read-model đọc từ bút toán (sổ cái, báo cáo).
 *
 * Cả sổ cái lẫn báo cáo tài chính đều cần đúng hai việc: **giải một khoảng
 * ngày** (theo kỳ kế toán hoặc theo fromDate/toDate) và **gộp phát sinh theo
 * tài khoản**. Gộp về đây để chỉ có một định nghĩa duy nhất cho "bút toán nào
 * ảnh hưởng sổ" — tránh hai module lệch nhau về sau.
 */

/**
 * Chỉ bút toán **đã ghi sổ** mới ảnh hưởng sổ cái.
 *
 * `reversed` cũng thuộc tập này: bút toán bị đảo vẫn đã từng được ghi sổ, và bút
 * toán đảo (cũng ở trạng thái `posted`) mang Nợ/Có hoán đổi nên cộng cả hai lại
 * thì chúng tự triệt tiêu — đúng bằng thực tế đã hạch toán.
 */
export const LEDGER_STATUSES: readonly JournalStatus[] = [
  JournalStatus.POSTED,
  JournalStatus.REVERSED,
];

export interface DateRange {
  fromDate: string;
  toDate: string;
}

/** Khoảng ngày đã giải (kèm kỳ kế toán nếu truy vấn theo kỳ). */
export interface ResolvedRange extends DateRange {
  period: FiscalPeriod | null;
}

/** Tổng hợp phát sinh của một tài khoản trong khoảng ngày. */
export interface AccountMovementTotals {
  accountId: string;
  openingDebit: string;
  openingCredit: string;
  debitTotal: string;
  creditTotal: string;
}

/**
 * Giải phạm vi truy vấn: theo `periodId`, hoặc theo cặp `fromDate` + `toDate`.
 * Ném 400 nếu thiếu, 404 nếu kỳ không tồn tại.
 */
export async function resolveRange(
  periods: Repository<FiscalPeriod>,
  query: { periodId?: string; fromDate?: string; toDate?: string },
): Promise<ResolvedRange> {
  if (query.periodId) {
    const period = await periods.findOne({ where: { id: query.periodId } });
    if (!period) {
      throw new NotFoundException('Không tìm thấy kỳ kế toán');
    }
    return { fromDate: period.startDate, toDate: period.endDate, period };
  }

  if (!query.fromDate || !query.toDate) {
    throw new BadRequestException(
      'Cần cung cấp periodId, hoặc cả fromDate và toDate',
    );
  }
  if (query.fromDate > query.toDate) {
    throw new BadRequestException('fromDate phải nhỏ hơn hoặc bằng toDate');
  }

  return { fromDate: query.fromDate, toDate: query.toDate, period: null };
}

/**
 * Gộp phát sinh của mọi tài khoản trong khoảng ngày, tách phần **trước
 * `fromDate`** (số dư đầu kỳ) khỏi phần **trong khoảng** (phát sinh kỳ).
 *
 * Chạy đúng một truy vấn GROUP BY, dùng `CASE WHEN` để tách hai phần.
 */
export async function aggregateAccountMovements(
  lines: Repository<JournalLine>,
  range: DateRange,
): Promise<Map<string, AccountMovementTotals>> {
  const rows = await lines
    .createQueryBuilder('line')
    .innerJoin('line.entry', 'entry')
    .select('line.account_id', 'accountId')
    .addSelect(
      'SUM(CASE WHEN entry.entry_date < :fromDate THEN line.debit ELSE 0 END)',
      'openingDebit',
    )
    .addSelect(
      'SUM(CASE WHEN entry.entry_date < :fromDate THEN line.credit ELSE 0 END)',
      'openingCredit',
    )
    .addSelect(
      'SUM(CASE WHEN entry.entry_date >= :fromDate THEN line.debit ELSE 0 END)',
      'debitTotal',
    )
    .addSelect(
      'SUM(CASE WHEN entry.entry_date >= :fromDate THEN line.credit ELSE 0 END)',
      'creditTotal',
    )
    .where('entry.status IN (:...statuses)', { statuses: LEDGER_STATUSES })
    .andWhere('entry.entry_date <= :toDate')
    .setParameter('fromDate', range.fromDate)
    .setParameter('toDate', range.toDate)
    .groupBy('line.account_id')
    .getRawMany<AccountMovementTotals>();

  return new Map(rows.map((row) => [row.accountId, row]));
}
