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
import { InboundEventRegistry } from './inbound-event-registry.service.js';
import { JobRunsService } from './job-runs.service.js';
import { JobsController } from './jobs.controller.js';
import { JobsScheduler } from './jobs.scheduler.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OverdueInvoiceSweepService } from './overdue-invoice-sweep.service.js';
import { DeadLetterProcessor } from './processors/dead-letter.processor.js';
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
 * Bảy hàng đợi, mỗi hàng một processor:
 *
 * | Hàng đợi | Việc | Số lần thử |
 * |---|---|---|
 * | `reports` | sinh báo cáo nặng (Excel/PDF) | 2 |
 * | `maintenance` | chốt số dư, kiểm tra bất biến, quét webhook treo | 3 |
 * | `notifications` | ghi thông báo, nhắc công nợ, quét hóa đơn quá hạn | 5 |
 * | `webhooks` | giao webhook ra ngoài | 5 |
 * | `payments` | tra cứu provider cho intent chưa kết luận (10.B) | 5 |
 * | `statements` | nạp sao kê + khớp lại đối soát (10.B) | 3 |
 * | `dead-letter` | tập kết job hết lượt thử — không tự retry | 1 |
 *
 * Bốn hàng đợi đầu có processor nằm ngay trong module này. Hai hàng đợi của mục
 * 10.B được **đăng ký trùng tên** ở `PaymentIntentsModule`/`ReconciliationModule`
 * để `@Processor` nằm cùng nơi với nghiệp vụ — cả hai cùng trỏ vào một hàng đợi
 * Redis, nên chỉ có một nguồn sự thật.
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
      // Mục 10.B — hàng đợi thứ 5 (thanh toán) và hàng đợi sao kê/đối soát.
      { name: JobQueue.PAYMENTS },
      { name: JobQueue.STATEMENTS },
      // Thư chết: nơi tập kết job hết lượt thử (mục 9 ⏳ đã hoàn tất).
      { name: JobQueue.DEAD_LETTER },
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
    // Sổ đăng ký handler webhook nhận vào — module nghiệp vụ tự đăng ký (mục 10.B).
    InboundEventRegistry,

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
    DeadLetterProcessor,
  ],
  exports: [
    NotificationsService,
    WebhooksService,
    QueueService,
    InboundEventRegistry,
    // Mục 10.B — module nghiệp vụ (thanh toán, sao kê) đặt `@Processor` ngay tại
    // module của mình, mà mọi processor đều kế thừa `TrackedWorkerHost` nên cần
    // `JobRunsService` để ghi vết lượt chạy. Thiếu export này thì app **sập lúc
    // khởi động** (Nest không resolve được tham số đầu của processor).
    JobRunsService,
  ],
})
export class JobsModule {}
