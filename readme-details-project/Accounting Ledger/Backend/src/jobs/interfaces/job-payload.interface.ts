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

/** `webhooks` · `deliver-webhook` */
export interface DeliverWebhookPayload extends JobPayloadBase {
  deliveryId: string;
}

/**
 * `payments` · `payment-status-poll` (mục 10.B).
 *
 * Không truyền `intentId` ⇒ job quét **mọi** intent chưa kết luận (chạy theo cron).
 * Truyền `intentId` ⇒ chỉ tra cứu một intent (dùng khi người dùng bấm "tra cứu lại").
 */
export interface PaymentStatusPollPayload extends JobPayloadBase {
  intentId?: string;
}

/** `statements` · `import-statement` (mục 10.B) — nạp & chuẩn hóa một file sao kê. */
export interface ImportStatementPayload extends JobPayloadBase {
  statementId: string;
}

/** `statements` · `reconciliation-catchup` (mục 10.B) — khớp lại toàn bộ sao kê còn mở. */
export interface ReconciliationCatchupPayload extends JobPayloadBase {
  asOfDate?: string;
}

/** `dead-letter` · `dead-letter-archive` — lưu vết job đã hết số lần thử. */
export interface DeadLetterArchivePayload extends JobPayloadBase {
  sourceQueue: string;
  sourceJobName: string;
  sourceRunId: string | null;
  error: string;
  attempts: number;
  originalPayload?: Record<string, unknown> | null;
}
