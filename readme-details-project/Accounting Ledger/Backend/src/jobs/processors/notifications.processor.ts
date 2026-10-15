import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { DebtReminderService } from '../debt-reminder.service.js';
import { JobName, JobQueue } from '../enums/job.enum.js';
import type {
  DebtReminderPayload,
  OverdueInvoiceSweepPayload,
  SendNotificationPayload,
} from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { NotificationsService } from '../notifications.service.js';
import { OverdueInvoiceSweepService } from '../overdue-invoice-sweep.service.js';
import { QueueService } from '../queue.service.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/**
 * Gửi thông báo (mục 9 — "job nền: gửi thông báo").
 *
 * Thông báo **không** được ghi trực tiếp từ job khác mà đi qua hàng đợi riêng:
 * nhờ vậy việc sinh báo cáo nặng không phải chờ ghi thông báo, và nếu kênh nhận
 * thông báo đổi (thêm email/SMS/Zalo sau này) thì chỉ cần sửa một processor.
 *
 * Ba loại job:
 * - `send-notification`: ghi một thông báo theo payload (dùng cho mọi job khác).
 * - `debt-reminder`: tổng hợp công nợ 131/331 + tuổi nợ theo đối tượng rồi tự tạo
 *   thông báo nhắc nhở.
 * - `overdue-invoice-sweep`: quét hóa đơn bán quá hạn (mục 10.A) → thông báo
 *   cho quản trị **và** phát webhook `invoice.overdue`.
 */
@Processor(JobQueue.NOTIFICATIONS)
export class NotificationsProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly notifications: NotificationsService,
    private readonly debtReminder: DebtReminderService,
    private readonly overdueSweep: OverdueInvoiceSweepService,
    private readonly queue: QueueService,
  ) {
    super(runs, queue);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    switch (job.name) {
      case JobName.SEND_NOTIFICATION:
        return this.send(job);
      case JobName.DEBT_REMINDER:
        return this.remindDebt(job);
      case JobName.OVERDUE_INVOICE_SWEEP:
        return this.sweepOverdueInvoices(job);
      default:
        throw new Error(`Job "${job.name}" không được hỗ trợ ở hàng đợi thông báo`);
    }
  }

  private async send(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as SendNotificationPayload;
    const notification = await this.notifications.create({
      type: payload.type,
      title: payload.title,
      body: payload.body,
      severity: payload.severity,
      audience: payload.audience,
      targetUserId: payload.targetUserId ?? null,
      data: payload.data ?? null,
    });

    return {
      notificationId: notification.id,
      type: notification.type,
      audience: notification.audience,
    };
  }

  private async remindDebt(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as DebtReminderPayload;
    const summary = await this.debtReminder.run({ asOfDate: payload.asOfDate });

    return {
      asOfDate: summary.asOfDate,
      totalReceivable: summary.totalReceivable,
      totalPayable: summary.totalPayable,
      receivableAccounts: summary.receivableAccounts.length,
      payableAccounts: summary.payableAccounts.length,
      // Mục 10.A — tóm tắt phần theo đối tượng + tuổi nợ để "Xử lý bất đồng bộ" hiển thị được.
      receivableParties: summary.receivablesAging.parties.length,
      payableParties: summary.payablesAging.parties.length,
      receivableOverdue: summary.receivablesAging.totalOverdue,
      payableOverdue: summary.payablesAging.totalOverdue,
      notificationId: summary.notificationId,
    };
  }

  private async sweepOverdueInvoices(
    job: Job,
  ): Promise<Record<string, unknown>> {
    const payload = job.data as OverdueInvoiceSweepPayload;
    const summary = await this.overdueSweep.run({ asOfDate: payload.asOfDate });

    return {
      asOfDate: summary.asOfDate,
      overdueInvoices: summary.overdueInvoices,
      overdueParties: summary.overdueParties,
      totalOverdue: summary.totalOverdue,
      oldestDaysOverdue: summary.oldestDaysOverdue,
      notificationId: summary.notificationId,
      webhookDeliveries: summary.webhookDeliveries,
    };
  }
}
