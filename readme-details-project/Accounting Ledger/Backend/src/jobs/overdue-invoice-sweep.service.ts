import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { AgingReportService } from '../reports/aging-report.service.js';
import {
  isOverdueBucket,
  type AgingLine,
} from '../reports/interfaces/aging-view.interface.js';
import type { Notification } from './entities/notification.entity.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from './enums/notification.enum.js';
import { JobTrigger } from './enums/job.enum.js';
import { WebhookEventType } from './enums/webhook.enum.js';
import { NotificationsService } from './notifications.service.js';
import { WebhooksService } from './webhooks.service.js';

/** Payload của job `overdue-invoice-sweep`. */
export interface OverdueSweepPayload {
  asOfDate?: string;
}

/** Kết quả một lượt quét — lưu vào `job_runs.result`. */
export interface OverdueInvoiceSweepSummary {
  asOfDate: string;
  overdueInvoices: number;
  overdueParties: number;
  totalOverdue: string;
  /** Số ngày quá hạn lớn nhất trong lượt quét — `null` khi không có hóa đơn quá hạn. */
  oldestDaysOverdue: number | null;
  notificationCreated: boolean;
  notificationId: string | null;
  /** Số lần giao webhook đã xếp (0 khi không có hóa đơn quá hạn). */
  webhookDeliveries: number;
}

/** Số đối tượng tối đa liệt kê trong thân thông báo (phần còn lại chỉ nêu tổng). */
const MAX_PARTIES_IN_BODY = 10;

/**
 * Quét **hóa đơn bán quá hạn** (mục 10.A) — cron hằng ngày.
 *
 * Khác `debt-reminder` ở chỗ **có hạn thanh toán**: `debt-reminder` chỉ đọc số dư tài
 * khoản 131/331 nên không biết khoản nào đã quá hạn; job này dùng đúng dữ liệu hóa đơn
 * (`dueDate`) + phân bổ thanh toán để tính **số còn lại thật** và tuổi nợ.
 *
 * Khi có hóa đơn quá hạn, job làm hai việc:
 * 1. tạo **thông báo** cho `poster`/`admin` (màn hình xử lý bất đồng bộ) — đúng
 *    người có quyền xử lý công nợ, `maker`/`checker` không ghi sổ được;
 * 2. phát webhook `invoice.overdue` ra hệ thống ngoài.
 *
 * Chống gửi trùng: `resourceRef` của sự kiện là `sweep:<ngày quét>` và
 * `WebhooksService` chống giao trùng theo `eventType:resourceRef:endpoint` — nên chạy
 * lại job trong cùng ngày (retry, trigger tay) không gửi thêm lần nữa.
 *
 * Không có gì quá hạn thì **không** tạo thông báo và **không** phát webhook — tránh làm
 * loãng hộp thông báo và tránh gọi ra ngoài vô ích.
 */
@Injectable()
export class OverdueInvoiceSweepService {
  constructor(
    private readonly aging: AgingReportService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async run(
    options: OverdueSweepPayload = {},
  ): Promise<OverdueInvoiceSweepSummary> {
    const view = await this.aging.receivablesAging({
      asOfDate: options.asOfDate,
    });

    // "Chưa đến hạn" và "không có ngày đến hạn" chưa phải nợ quá hạn — cùng một
    // hàm lọc dùng chung với job nhắc nợ để hai nơi không lệch nhau.
    const overdue = view.lines.filter((line) => isOverdueBucket(line.bucket));

    const totalOverdue = overdue.reduce(
      (sum, line) => sum.plus(toMoney(line.outstanding)),
      new Decimal(0),
    );
    const partyIds = new Set(overdue.map((line) => line.partyId));
    const oldestDaysOverdue = overdue.reduce<number | null>(
      (oldest, line) =>
        line.daysOverdue === null
          ? oldest
          : Math.max(oldest ?? 0, line.daysOverdue),
      null,
    );

    let notification: Notification | null = null;
    let webhookDeliveries = 0;

    if (overdue.length > 0) {
      notification = await this.notifications.create({
        type: NotificationType.OVERDUE_INVOICE,
        severity: NotificationSeverity.WARNING,
        audience: NotificationAudience.POSTER,
        title: `Hóa đơn quá hạn đến ${view.asOfDate}`,
        body: buildBody(
          view.asOfDate,
          overdue,
          totalOverdue,
          oldestDaysOverdue ?? 0,
        ),
        data: {
          asOfDate: view.asOfDate,
          overdueInvoices: overdue.length,
          overdueParties: partyIds.size,
          totalOverdue: moneyToString(totalOverdue),
          oldestDaysOverdue,
        },
      });

      const deliveries = await this.webhooks.dispatch({
        eventType: WebhookEventType.INVOICE_OVERDUE,
        resourceRef: `sweep:${view.asOfDate}`,
        data: {
          asOfDate: view.asOfDate,
          overdueInvoices: overdue.length,
          overdueParties: partyIds.size,
          totalOverdue: moneyToString(totalOverdue),
          invoices: overdue.slice(0, MAX_PARTIES_IN_BODY).map((line) => ({
            code: line.code,
            partyCode: line.partyCode,
            dueDate: line.dueDate,
            outstanding: line.outstanding,
            daysOverdue: line.daysOverdue,
          })),
        },
        trigger: JobTrigger.SCHEDULE,
        actor: null,
      });
      webhookDeliveries = deliveries.length;
    }

    return {
      asOfDate: view.asOfDate,
      overdueInvoices: overdue.length,
      overdueParties: partyIds.size,
      totalOverdue: moneyToString(totalOverdue),
      oldestDaysOverdue,
      notificationCreated: notification !== null,
      notificationId: notification?.id ?? null,
      webhookDeliveries,
    };
  }
}

function buildBody(
  asOfDate: string,
  overdue: readonly AgingLine[],
  totalOverdue: Decimal,
  oldestDaysOverdue: number,
): string {
  const lines: string[] = [
    `Có ${overdue.length} hóa đơn bán quá hạn tại ngày ${asOfDate}, tổng còn phải thu ${moneyToString(totalOverdue)}.`,
    `Quá hạn lâu nhất: ${oldestDaysOverdue} ngày.`,
    '',
  ];

  const byParty = new Map<string, { label: string; amount: Decimal; count: number }>();
  for (const line of overdue) {
    const existing = byParty.get(line.partyId) ?? {
      label: `${line.partyCode} ${line.partyName}`,
      amount: new Decimal(0),
      count: 0,
    };
    existing.amount = existing.amount.plus(toMoney(line.outstanding));
    existing.count += 1;
    byParty.set(line.partyId, existing);
  }

  const ranked = [...byParty.values()].sort((left, right) =>
    right.amount.comparedTo(left.amount),
  );

  for (const row of ranked.slice(0, MAX_PARTIES_IN_BODY)) {
    lines.push(
      `• ${row.label}: ${moneyToString(row.amount)} (${row.count} hóa đơn)`,
    );
  }
  if (ranked.length > MAX_PARTIES_IN_BODY) {
    lines.push(`… và ${ranked.length - MAX_PARTIES_IN_BODY} đối tượng khác.`);
  }

  return lines.join('\n');
}
