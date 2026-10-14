import type { ReportFormat, ReportKind } from '../../reports/enums/report.enum.js';
import type {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../enums/notification.enum.js';

/**
 * Payload của từng loại job (mục 9).
 *
 * Khai báo tập trung để producer (controller/service) và consumer (processor)
 * dùng chung một định nghĩa — tránh lệch khóa khi job được ghi vào Redis rồi
 * được đọc lại ở tiến trình khác.
 *
 * Mọi payload đều có thể kèm `jobRunId` do `QueueService` tự gắn; worker dùng
 * khóa đó để cập nhật đúng dòng `job_runs`.
 */
export interface JobPayloadBase {
  jobRunId?: string;
}

/** `reports` · `generate-report` */
export interface GenerateReportPayload extends JobPayloadBase {
  kind?: ReportKind;
  format?: ReportFormat;
  periodId?: string;
  fromDate?: string;
  toDate?: string;
  /** Người yêu cầu — để gửi thông báo "báo cáo sẵn sàng" đích danh. */
  requestedBy?: string | null;
  requestedByEmail?: string | null;
}

/** `notifications` · `send-notification` */
export interface SendNotificationPayload extends JobPayloadBase {
  type: NotificationType;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  audience?: NotificationAudience;
  targetUserId?: string | null;
  data?: Record<string, unknown> | null;
}

/** `maintenance` · `balance-snapshot` */
export interface BalanceSnapshotPayload extends JobPayloadBase {
  periodId?: string;
  repair?: boolean;
}

/** `maintenance` · `integrity-check` */
export interface IntegrityCheckPayload extends JobPayloadBase {
  periodId?: string;
}

/** `maintenance` · `webhook-sweep` */
export interface WebhookSweepPayload extends JobPayloadBase {
  limit?: number;
}

/** `notifications` · `debt-reminder` */
export interface DebtReminderPayload extends JobPayloadBase {
  asOfDate?: string;
}

/** `webhooks` · `deliver-webhook` */
export interface DeliverWebhookPayload extends JobPayloadBase {
  deliveryId: string;
}
