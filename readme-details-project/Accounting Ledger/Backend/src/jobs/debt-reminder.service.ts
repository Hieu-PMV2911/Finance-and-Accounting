import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { LEDGER_STATUSES } from '../ledger/ledger-aggregate.util.js';
import type { Notification } from './entities/notification.entity.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from './enums/notification.enum.js';
import { NotificationsService } from './notifications.service.js';

/** Một tài khoản công nợ còn số dư. */
export interface DebtBalanceLine {
  accountCode: string;
  accountName: string;
  /** Số dư thuần theo chiều công nợ (luôn dương khi còn nợ). */
  outstanding: string;
}

/** Kết quả một lần nhắc công nợ — lưu vào `job_runs.result`. */
export interface DebtReminderSummary {
  asOfDate: string;
  receivables: DebtBalanceLine[];
  payables: DebtBalanceLine[];
  totalReceivable: string;
  totalPayable: string;
  notificationCreated: boolean;
  notificationId: string | null;
}

/** Tiền tố mã tài khoản công nợ theo TT200. */
const RECEIVABLE_PREFIX = '131';
const PAYABLE_PREFIX = '331';

/**
 * Nhắc công nợ (mục 9 — "nhắc công nợ").
 *
 * Đọc số dư thuần lũy kế đến `asOfDate` của các tài khoản công nợ:
 * - **Phải thu khách hàng** (`131*`): dư Nợ = khách còn nợ mình.
 * - **Phải trả người bán** (`331*`): dư Có = mình còn nợ nhà cung cấp.
 *
 * ⚠️ Đây là **công nợ tổng hợp theo tài khoản**, chưa phân tích theo tuổi nợ
 * (30/60/90 ngày) hay theo từng khách/nhà cung cấp: muốn vậy cần dữ liệu hóa
 * đơn và hạn thanh toán của **Mini ERP** (mục 10). Job này cố tình chỉ dùng dữ
 * liệu đang có trong sổ cái nên chạy được ngay mà không bịa ra hạn nợ.
 *
 * Không có gì để nhắc (mọi tài khoản công nợ đã tất toán) thì **không** tạo
 * thông báo — tránh làm loãng hộp thông báo.
 */
@Injectable()
export class DebtReminderService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  async run(
    options: { asOfDate?: string } = {},
  ): Promise<DebtReminderSummary> {
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const rows = await this.balances(asOfDate);

    const receivables: DebtBalanceLine[] = [];
    const payables: DebtBalanceLine[] = [];

    for (const row of rows) {
      const net = toMoney(row.net);
      if (net.isZero()) continue;

      if (net.isPositive()) {
        receivables.push({
          accountCode: row.code,
          accountName: row.name,
          outstanding: moneyToString(net),
        });
      } else {
        payables.push({
          accountCode: row.code,
          accountName: row.name,
          outstanding: moneyToString(net.negated()),
        });
      }
    }

    const totalReceivable = receivables.reduce(
      (sum, line) => sum.plus(toMoney(line.outstanding)),
      toMoney(0),
    );
    const totalPayable = payables.reduce(
      (sum, line) => sum.plus(toMoney(line.outstanding)),
      toMoney(0),
    );

    let notification: Notification | null = null;
    if (receivables.length > 0 || payables.length > 0) {
      notification = await this.notifications.create({
        type: NotificationType.DEBT_REMINDER,
        severity: NotificationSeverity.INFO,
        audience: NotificationAudience.ALL,
        title: `Nhắc công nợ đến ${asOfDate}`,
        body: buildBody(asOfDate, receivables, payables, totalReceivable, totalPayable),
        data: {
          asOfDate,
          totalReceivable: moneyToString(totalReceivable),
          totalPayable: moneyToString(totalPayable),
          receivableAccounts: receivables.length,
          payableAccounts: payables.length,
        },
      });
    }

    return {
      asOfDate,
      receivables,
      payables,
      totalReceivable: moneyToString(totalReceivable),
      totalPayable: moneyToString(totalPayable),
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

function buildBody(
  asOfDate: string,
  receivables: readonly DebtBalanceLine[],
  payables: readonly DebtBalanceLine[],
  totalReceivable: ReturnType<typeof toMoney>,
  totalPayable: ReturnType<typeof toMoney>,
): string {
  const lines: string[] = [`Số dư công nợ lũy kế đến ${asOfDate}.`];

  if (receivables.length > 0) {
    lines.push('');
    lines.push(`Phải thu khách hàng — tổng ${moneyToString(totalReceivable)}:`);
    for (const line of receivables) {
      lines.push(`• ${line.accountCode} ${line.accountName}: ${line.outstanding}`);
    }
  }

  if (payables.length > 0) {
    lines.push('');
    lines.push(`Phải trả người bán — tổng ${moneyToString(totalPayable)}:`);
    for (const line of payables) {
      lines.push(`• ${line.accountCode} ${line.accountName}: ${line.outstanding}`);
    }
  }

  return lines.join('\n');
}
