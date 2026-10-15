import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReportsModule } from '../reports/reports.module.js';
import { BalanceSnapshotService } from './balance-snapshot.service.js';
import { DebtReminderService } from './debt-reminder.service.js';
import { JobRun } from './entities/job-run.entity.js';
import { Notification } from './entities/notification.entity.js';
import { WebhookDelivery } from './entities/webhook-delivery.entity.js';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { JobQueue } from './enums/job.enum.js';
import { IntegrityService } from './integrity.service.js';
import { JobRunsService } from './job-runs.service.js';
import { JobsController } from './jobs.controller.js';
import { JobsScheduler } from './jobs.scheduler.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OverdueInvoiceSweepService } from './overdue-invoice-sweep.service.js';
import { MaintenanceProcessor } from './processors/maintenance.processor.js';
import { NotificationsProcessor } from './processors/notifications.processor.js';
import { ReportsProcessor } from './processors/reports.processor.js';
import { WebhooksProcessor } from './processors/webhooks.processor.js';
import { QueueService } from './queue.service.js';
import { ReportStorageService } from './report-storage.service.js';
import { SchedulesService } from './schedules.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * Xử lý bất đồng bộ (mục 9): **Queue (BullMQ) + Schedule (cron)**.
 *
 * Bốn hàng đợi, mỗi hàng một processor:
 *
 * | Hàng đợi | Việc | Số lần thử |
 * |---|---|---|
 * | `reports` | sinh báo cáo nặng (Excel/PDF) | 2 |
 * | `maintenance` | chốt số dư, kiểm tra bất biến, quét webhook treo | 3 |
 * | `notifications` | ghi thông báo, nhắc công nợ, quét hóa đơn quá hạn | 5 |
 * | `webhooks` | giao webhook ra ngoài | 5 |
 *
 * `BullModule.registerQueue` chỉ khai báo hàng đợi; kết nối Redis lấy từ
 * `BullModule.forRootAsync` trong `AppModule` nên cấu hình nằm một chỗ.
 *
 * `JobsScheduler` là provider thường (không phải controller) — `ScheduleModule`
 * tự quét `@Cron` trên mọi provider của ứng dụng.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: JobQueue.REPORTS },
      { name: JobQueue.MAINTENANCE },
      { name: JobQueue.NOTIFICATIONS },
      { name: JobQueue.WEBHOOKS },
    ),
    TypeOrmModule.forFeature([
      JobRun,
      Notification,
      WebhookEndpoint,
      WebhookDelivery,
      WebhookEvent,
    ]),
    ReportsModule,
  ],
  controllers: [JobsController, NotificationsController, WebhooksController],
  providers: [
    // Hạ tầng job
    JobRunsService,
    QueueService,
    SchedulesService,
    ReportStorageService,
    JobsScheduler,

    // Nghiệp vụ chạy nền
    IntegrityService,
    BalanceSnapshotService,
    DebtReminderService,
    OverdueInvoiceSweepService,
    NotificationsService,
    WebhooksService,

    // Worker
    ReportsProcessor,
    MaintenanceProcessor,
    NotificationsProcessor,
    WebhooksProcessor,
  ],
  exports: [NotificationsService, WebhooksService, QueueService],
})
export class JobsModule {}
