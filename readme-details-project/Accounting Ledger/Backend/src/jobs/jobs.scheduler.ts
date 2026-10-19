import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import {
  BALANCE_SNAPSHOT_CRON,
  DEBT_REMINDER_CRON,
  INTEGRITY_CHECK_CRON,
  OVERDUE_INVOICE_SWEEP_CRON,
  PAYMENT_STATUS_POLL_CRON,
  SchedulesService,
  WEBHOOK_SWEEP_CRON,
} from './schedules.service.js';

/**
 * Lịch chạy định kỳ (mục 9 — `@nestjs/schedule`).
 *
 * Mỗi cron **không** tự làm việc nặng: nó chỉ **xếp job** vào BullMQ, còn việc
 * thực thi do worker đảm nhiệm. Nhờ vậy:
 * - cron không giữ tiến trình chính (API vẫn phục vụ bình thường);
 * - mọi lần chạy đều có dòng `job_runs`, thấy được trong màn hình "Xử lý bất
 *   đồng bộ" như mọi job khác;
 * - job lỗi được retry theo backoff thay vì thất bại im lặng.
 *
 * Biểu thức cron lấy từ `SCHEDULE_DEFINITIONS` (một nguồn sự thật dùng chung với
 * API hiển thị lịch), và có thể tắt toàn bộ lịch bằng `JOBS_SCHEDULER_ENABLED=false`.
 */
@Injectable()
export class JobsScheduler {
  constructor(private readonly schedules: SchedulesService) {}

  /** 01:00 hằng ngày — tái lập & đối chiếu số dư kỳ đang mở. */
  @Cron(BALANCE_SNAPSHOT_CRON)
  async scheduleBalanceSnapshot(): Promise<void> {
    await this.schedules.runScheduled('balance-snapshot');
  }

  /** 02:30 hằng ngày — kiểm tra 7 bất biến nghiệp vụ. */
  @Cron(INTEGRITY_CHECK_CRON)
  async scheduleIntegrityCheck(): Promise<void> {
    await this.schedules.runScheduled('integrity-check');
  }

  /** 08:00 thứ Hai hằng tuần — nhắc công nợ phải thu / phải trả. */
  @Cron(DEBT_REMINDER_CRON)
  async scheduleDebtReminder(): Promise<void> {
    await this.schedules.runScheduled('debt-reminder');
  }

  /** 09:00 hằng ngày — quét hóa đơn bán quá hạn (mục 10.A). */
  @Cron(OVERDUE_INVOICE_SWEEP_CRON)
  async scheduleOverdueInvoiceSweep(): Promise<void> {
    await this.schedules.runScheduled('overdue-invoice-sweep');
  }

  /** Mỗi 5 phút — đẩy lại webhook còn treo do mất job. */
  @Cron(WEBHOOK_SWEEP_CRON)
  async scheduleWebhookSweep(): Promise<void> {
    await this.schedules.runScheduled('webhook-retry-sweep');
  }

  /** Mỗi 2 phút — tra cứu trạng thái thanh toán (mục 10.B). */
  @Cron(PAYMENT_STATUS_POLL_CRON)
  async schedulePaymentStatusPoll(): Promise<void> {
    await this.schedules.runScheduled('payment-status-poll');
  }
}
