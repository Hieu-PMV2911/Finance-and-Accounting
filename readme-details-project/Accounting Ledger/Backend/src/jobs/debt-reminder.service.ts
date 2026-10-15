import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { LEDGER_STATUSES } from '../ledger/ledger-aggregate.util.js';
import { AgingReportService } from '../reports/aging-report.service.js';
import {
  isOverdueBucket,
  type AgingBucket,
  type AgingView,
} from '../reports/interfaces/aging-view.interface.js';
import type { Notification } from './entities/notification.entity.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from './enums/notification.enum.js';
import { NotificationsService } from './notifications.service.js';

/** Một tài khoản công nợ còn số dư (đọc từ sổ cái). */
export interface DebtBalanceLine {
  accountCode: string;
  accountName: string;
  /** Số dư thuần theo chiều công nợ (luôn dương khi còn nợ). */
  outstanding: string;
}

/** Một đối tượng còn nợ, xếp theo số còn lại giảm dần. */
export interface DebtPartyLine {
  partyId: string;
  partyCode: string;
  partyName: string;
  /** Tổng còn phải thu/phải trả (chưa trừ phần đã phân bổ). */
  outstanding: string;
  /** Phần đã quá hạn thanh toán. */
  overdue: string;
  /** Số ngày quá hạn lớn nhất của đối tượng này; `null` khi chưa có gì quá hạn. */
  oldestDaysOverdue: number | null;
  /** Số chứng từ còn số dư. */
  documents: number;
}

/**
 * Công nợ phân tích **theo đối tượng + tuổi nợ** (mục 10.A).
 *
 * Đọc từ hóa đơn/phiếu đã ghi sổ và phân bổ thanh toán — khác hẳn phần đọc từ sổ cái
 * ở `DebtBalanceLine`: sổ cái cho biết **tổng** công nợ, còn phần này cho biết **ai** nợ
 * và **nợ đã bao lâu**. Hai con số phải khớp nhau; lệch nghĩa là có bút toán công nợ
 * không gắn với chứng từ nào (nhập tay) — thông tin đáng để người dùng thấy.
 */
export interface DebtAgingAnalysis {
  asOfDate: string;
  buckets: AgingBucket[];
  /** Σ số còn lại của mọi chứng từ còn nợ = Σ các nhóm tuổi. */
  totalOutstanding: string;
  /** Phần đã quá hạn (không gồm "chưa đến hạn" và "không có ngày đến hạn"). */
  totalOverdue: string;
  parties: DebtPartyLine[];
  /** Số chứng từ còn số dư. */
  documents: number;
}

/** Kết quả một lần nhắc công nợ — lưu vào `job_runs.result`. */
export interface DebtReminderSummary {
  asOfDate: string;
  receivableAccounts: DebtBalanceLine[];
  payableAccounts: DebtBalanceLine[];
  totalReceivable: string;
  totalPayable: string;
  receivablesAging: DebtAgingAnalysis;
  payablesAging: DebtAgingAnalysis;
  notificationCreated: boolean;
  notificationId: string | null;
}

/** Tiền tố mã tài khoản công nợ theo TT200. */
const RECEIVABLE_PREFIX = '131';
const PAYABLE_PREFIX = '331';

/** Số đối tượng tối đa liệt kê trong thân thông báo (phần còn lại chỉ nêu tổng). */
const MAX_PARTIES_IN_BODY = 10;
/** Số tài khoản tối đa liệt kê theo tài khoản. */
const MAX_ACCOUNTS_IN_BODY = 10;

/**
 * Nhắc công nợ (mục 9 — "nhắc công nợ"), nâng cấp ở mục 10.A.
 *
 * Hai lớp phân tích, cố ý **không** thay thế nhau:
 *
 * 1. **Theo tài khoản, đọc từ sổ cái** — Phải thu khách hàng (`131*`, dư Nợ) và Phải trả
 *    người bán (`331*`, dư Có). Đây là con số **khớp với báo cáo tài chính** vì cùng đọc
 *    `journal_lines`.
 * 2. **Theo đối tượng + tuổi nợ** — đọc từ hóa đơn/phiếu đã ghi sổ (`dueDate` + phân bổ
 *    thanh toán), cho biết ai nợ và quá hạn bao lâu.
 *
 * Không có gì để nhắc (mọi tài khoản công nợ đã tất toán và không chứng từ nào còn nợ) thì
 * **không** tạo thông báo — tránh làm loãng hộp thông báo.
 *
 * ⚠️ Job này **nhắc tổng hợp**; việc tạo cảnh báo *từng hóa đơn quá hạn* + phát webhook do
 * `OverdueInvoiceSweepService` (cron `overdue-invoice-sweep`) đảm nhiệm.
 */
@Injectable()
export class DebtReminderService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly aging: AgingReportService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(
    options: { asOfDate?: string } = {},
  ): Promise<DebtReminderSummary> {
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const rows = await this.balances(asOfDate);

    const receivableAccounts: DebtBalanceLine[] = [];
    const payableAccounts: DebtBalanceLine[] = [];

    for (const row of rows) {
      const net = toMoney(row.net);
      if (net.isZero()) continue;

      if (net.isPositive()) {
        receivableAccounts.push({
          accountCode: row.code,
          accountName: row.name,
          outstanding: moneyToString(net),
        });
      } else {
        payableAccounts.push({
          accountCode: row.code,
          accountName: row.name,
          outstanding: moneyToString(net.negated()),
        });
      }
    }

    const totalReceivable = sumOf(receivableAccounts.map((line) => line.outstanding));
    const totalPayable = sumOf(payableAccounts.map((line) => line.outstanding));

    // Hai báo cáo tuổi nợ đọc cùng dữ liệu hóa đơn/phiếu ⇒ chạy song song được.
    const [receivableAging, payableAging] = await Promise.all([
      this.aging.receivablesAging({ asOfDate }),
      this.aging.payablesAging({ asOfDate }),
    ]);
    const receivablesAging = analyse(receivableAging);
    const payablesAging = analyse(payableAging);

    let notification: Notification | null = null;
    if (
      receivableAccounts.length > 0 ||
      payableAccounts.length > 0 ||
      receivablesAging.documents > 0 ||
      payablesAging.documents > 0
    ) {
      notification = await this.notifications.create({
        type: NotificationType.DEBT_REMINDER,
        severity: NotificationSeverity.INFO,
        audience: NotificationAudience.ALL,
        title: `Nhắc công nợ đến ${asOfDate}`,
        body: buildBody({
          asOfDate,
          receivableAccounts,
          payableAccounts,
          totalReceivable,
          totalPayable,
          receivablesAging,
          payablesAging,
        }),
        data: {
          asOfDate,
          totalReceivable: moneyToString(totalReceivable),
          totalPayable: moneyToString(totalPayable),
          receivableAccounts: receivableAccounts.length,
          payableAccounts: payableAccounts.length,
          receivableParties: receivablesAging.parties.length,
          payableParties: payablesAging.parties.length,
          receivableOverdue: receivablesAging.totalOverdue,
          payableOverdue: payablesAging.totalOverdue,
        },
      });
    }

    return {
      asOfDate,
      receivableAccounts,
      payableAccounts,
      totalReceivable: moneyToString(totalReceivable),
      totalPayable: moneyToString(totalPayable),
      receivablesAging,
      payablesAging,
      notificationCreated: notification !== null,
      notificationId: notification?.id ?? null,
    };
  }

  private async balances(asOfDate: string): Promise<
    { code: string; name: string; net: string }[]
  > {
    return this.dataSource.query(
      `SELECT a.code,
              a.name,
              COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS net
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN accounts a ON a.id = l.account_id
        WHERE e.status = ANY($1::text[])
          AND e.entry_date <= $2
          AND (a.code LIKE $3 OR a.code LIKE $4)
        GROUP BY a.code, a.name
       HAVING COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) <> 0
        ORDER BY a.code`,
      [
        [...LEDGER_STATUSES],
        asOfDate,
        `${RECEIVABLE_PREFIX}%`,
        `${PAYABLE_PREFIX}%`,
      ],
    );
  }
}

/** Cộng một danh sách số tiền ở dạng chuỗi (không dùng số thực để tránh sai số). */
function sumOf(amounts: readonly string[]): Decimal {
  return amounts.reduce((sum, amount) => sum.plus(toMoney(amount)), new Decimal(0));
}

/**
 * Gộp kết quả tuổi nợ thành hai nhóm: **tổng còn nợ** và **phần quá hạn**, kèm danh sách
 * đối tượng xếp theo số còn nợ giảm dần.
 *
 * Phép gộp ở đây không tính lại gì từ SQL — nó chỉ lật `lines` thành dòng theo đối tượng,
 * nên bất biến "Σ theo đối tượng = `totalOutstanding`" vẫn đúng theo cấu tạo.
 */
function analyse(view: AgingView): DebtAgingAnalysis {
  const buckets = view.buckets;
  const totalOverdue = buckets
    .filter((bucket) => isOverdueBucket(bucket.key))
    .reduce((sum, bucket) => sum.plus(toMoney(bucket.amount)), new Decimal(0));

  const byParty = new Map<
    string,
    DebtPartyLine & { outstandingAmount: Decimal; overdueAmount: Decimal }
  >();

  for (const line of view.lines) {
    const existing = byParty.get(line.partyId) ?? {
      partyId: line.partyId,
      partyCode: line.partyCode,
      partyName: line.partyName,
      outstanding: '0',
      overdue: '0',
      oldestDaysOverdue: null,
      documents: 0,
      outstandingAmount: new Decimal(0),
      overdueAmount: new Decimal(0),
    };

    const outstanding = toMoney(line.outstanding);
    existing.outstandingAmount = existing.outstandingAmount.plus(outstanding);
    existing.documents += 1;

    if (isOverdueBucket(line.bucket)) {
      existing.overdueAmount = existing.overdueAmount.plus(outstanding);
      existing.oldestDaysOverdue = Math.max(
        existing.oldestDaysOverdue ?? 0,
        line.daysOverdue ?? 0,
      );
    }

    byParty.set(line.partyId, existing);
  }

  const parties: DebtPartyLine[] = [...byParty.values()]
    .map((party) => ({
      partyId: party.partyId,
      partyCode: party.partyCode,
      partyName: party.partyName,
      outstanding: moneyToString(party.outstandingAmount),
      overdue: moneyToString(party.overdueAmount),
      oldestDaysOverdue: party.oldestDaysOverdue,
      documents: party.documents,
    }))
    .sort((left, right) => toMoney(right.outstanding).comparedTo(toMoney(left.outstanding)));

  return {
    asOfDate: view.asOfDate,
    buckets,
    totalOutstanding: view.totalOutstanding,
    totalOverdue: moneyToString(totalOverdue),
    parties,
    documents: view.lines.length,
  };
}

function buildBody(input: {
  asOfDate: string;
  receivableAccounts: readonly DebtBalanceLine[];
  payableAccounts: readonly DebtBalanceLine[];
  totalReceivable: Decimal;
  totalPayable: Decimal;
  receivablesAging: DebtAgingAnalysis;
  payablesAging: DebtAgingAnalysis;
}): string {
  const lines: string[] = [`Số dư công nợ lũy kế đến ${input.asOfDate}.`];

  appendAccountSection(
    lines,
    'Phải thu theo tài khoản',
    input.receivableAccounts,
    input.totalReceivable,
  );
  appendAccountSection(
    lines,
    'Phải trả theo tài khoản',
    input.payableAccounts,
    input.totalPayable,
  );
  appendAgingSection(lines, 'Tuổi nợ phải thu', input.receivablesAging);
  appendAgingSection(lines, 'Tuổi nợ phải trả', input.payablesAging);

  if (lines.length === 1) {
    lines.push('', 'Không còn công nợ nào chưa tất toán.');
  }

  return lines.join('\n');
}

function appendAccountSection(
  lines: string[],
  title: string,
  rows: readonly DebtBalanceLine[],
  total: Decimal,
): void {
  if (rows.length === 0) return;

  lines.push('', `${title} — tổng ${moneyToString(total)}:`);
  for (const row of rows.slice(0, MAX_ACCOUNTS_IN_BODY)) {
    lines.push(`• ${row.accountCode} ${row.accountName}: ${row.outstanding}`);
  }
  if (rows.length > MAX_ACCOUNTS_IN_BODY) {
    lines.push(`… và ${rows.length - MAX_ACCOUNTS_IN_BODY} tài khoản khác.`);
  }
}

function appendAgingSection(
  lines: string[],
  title: string,
  analysis: DebtAgingAnalysis,
): void {
  if (analysis.documents === 0) return;

  lines.push(
    '',
    `${title} — còn lại ${analysis.totalOutstanding}, trong đó quá hạn ${analysis.totalOverdue}:`,
  );

  // Chỉ in nhóm có tiền: in cả sáu nhóm với số 0 làm thông báo dài mà không thêm thông tin.
  for (const bucket of analysis.buckets) {
    if (toMoney(bucket.amount).isZero()) continue;
    lines.push(`• ${bucket.label}: ${bucket.amount}`);
  }

  if (analysis.parties.length > 0) {
    lines.push('Đối tượng còn nợ nhiều nhất:');
    for (const party of analysis.parties.slice(0, MAX_PARTIES_IN_BODY)) {
      const overdueNote = toMoney(party.overdue).isZero()
        ? 'chưa quá hạn'
        : `quá hạn ${party.overdue}, lâu nhất ${party.oldestDaysOverdue ?? 0} ngày`;
      lines.push(
        `• ${party.partyCode} ${party.partyName}: ${party.outstanding} (${overdueNote}, ${party.documents} chứng từ)`,
      );
    }
    if (analysis.parties.length > MAX_PARTIES_IN_BODY) {
      lines.push(
        `… và ${analysis.parties.length - MAX_PARTIES_IN_BODY} đối tượng khác.`,
      );
    }
  }
}
