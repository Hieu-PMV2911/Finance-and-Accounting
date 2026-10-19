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

/** `notifications` · `overdue-invoice-sweep` (mục 10.A) */
export interface OverdueInvoiceSweepPayload extends JobPayloadBase {
  asOfDate?: string;
}

/** `statements` · `import-statement` (mục 10.B — P2.2) */
export interface ImportStatementPayload extends JobPayloadBase {
  accountId: string;
  /** `file` (mặc định) hoặc `api`. */
  source?: string;
  sourceRef?: string;
  statementDate?: string;
  openingBalance?: string;
  closingBalance?: string;
  /** Toàn bộ nội dung file CSV/JSON. */
  content: string;
  /** Người yêu cầu nạp — để ghi vết. */
  actorId?: string;
}

/** `statements` · `reconcile-statement` (mục 10.B — P2.3) */
export interface ReconcileStatementPayload extends JobPayloadBase {
  statementId: string;
}

/** `statements` · `reconciliation-catchup` (mục 10.B — P2.3) */
export interface ReconciliationCatchupPayload extends JobPayloadBase {
  /** Số sao kê đối soát tối đa trong một lượt (mặc định 50). */
  limit?: number;
}

/** `payments` · `payment-status-poll` (mục 10.B) */
export interface PaymentStatusPollPayload extends JobPayloadBase {
  /** Số intent tra cứu trong một lượt (mặc định 50). */
  limit?: number;
}

/** `webhooks` · `deliver-webhook` */
export interface DeliverWebhookPayload extends JobPayloadBase {
  deliveryId: string;
}
