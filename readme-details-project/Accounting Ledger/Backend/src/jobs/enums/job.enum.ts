/**
 * Hàng đợi nền (BullMQ) — mục 9.
 *
 * Tách theo **tính chất công việc** để mỗi worker có thể cấu hình retry /
 * concurrency riêng: sinh báo cáo rất nặng nhưng hiếm, gửi webhook thì nhiều và
 * cần retry mịn, kiểm tra bất biến chạy định kỳ.
 */
export enum JobQueue {
  /** Sinh báo cáo nặng / xuất file (Excel, PDF) ở chế độ nền. */
  REPORTS = 'reports',
  /** Việc bảo trì định kỳ: chốt số dư, kiểm tra bất biến. */
  MAINTENANCE = 'maintenance',
  /** Gửi thông báo trong hệ thống (nhắc công nợ, cảnh báo bất biến). */
  NOTIFICATIONS = 'notifications',
  /** Gọi webhook ra hệ thống ngoài, có retry + backoff. */
  WEBHOOKS = 'webhooks',
  /**
   * Mục 10.B — vòng đời thanh toán: tra cứu provider, ghi sổ khi đã thu tiền.
   * Backoff riêng vì việc này phụ thuộc hệ thống bên thứ ba (có thể chậm/timeout).
   */
  PAYMENTS = 'payments',
  /** Mục 10.B — nạp & đối soát sao kê ngân hàng (nặng, chạy nền). */
  STATEMENTS = 'statements',
  /**
   * Hàng đợi **thư chết**: job đã hết số lần thử được chuyển về đây để người vận
   * hành nhìn thấy và xử lý — hoàn tất hạng mục ⏳ của mục 9. Không tự retry nữa.
   */
  DEAD_LETTER = 'dead-letter',
}

export const ALL_JOB_QUEUES: readonly JobQueue[] = Object.values(JobQueue);

export const JOB_QUEUE_LABELS: Record<JobQueue, string> = {
  [JobQueue.REPORTS]: 'Sinh báo cáo',
  [JobQueue.MAINTENANCE]: 'Bảo trì định kỳ',
  [JobQueue.NOTIFICATIONS]: 'Gửi thông báo',
  [JobQueue.WEBHOOKS]: 'Webhook',
  [JobQueue.PAYMENTS]: 'Thanh toán',
  [JobQueue.STATEMENTS]: 'Sao kê & đối soát',
  [JobQueue.DEAD_LETTER]: 'Thư chết',
};

/** Tên job bên trong từng hàng đợi. */
export enum JobName {
  /** `reports`: sinh báo cáo tài chính (kèm xuất file nếu có `format`). */
  GENERATE_REPORT = 'generate-report',
  /** `maintenance`: chốt/đối chiếu số dư một kỳ. */
  BALANCE_SNAPSHOT = 'balance-snapshot',
  /** `maintenance`: kiểm tra các bất biến nghiệp vụ. */
  INTEGRITY_CHECK = 'integrity-check',
  /** `notifications`: gửi (tạo) một thông báo trong hệ thống. */
  SEND_NOTIFICATION = 'send-notification',
  /** `notifications`: nhắc công nợ phải thu / phải trả. */
  DEBT_REMINDER = 'debt-reminder',
  /** Quét hóa đơn bán quá hạn (mục 10.A): thông báo + webhook `invoice.overdue`. */
  OVERDUE_INVOICE_SWEEP = 'overdue-invoice-sweep',
  /** `webhooks`: giao một webhook ra endpoint đã đăng ký. */
  DELIVER_WEBHOOK = 'deliver-webhook',
  /** `maintenance`: quét các lần giao webhook bị treo (mất job) rồi đẩy lại. */
  WEBHOOK_SWEEP = 'webhook-sweep',
  /**
   * `payments` (10.B): quét các intent **chưa kết luận** rồi tra cứu provider.
   * Đây là cơ chế biến `unknown` (timeout) thành kết luận thật, và ghi sổ khi
   * provider xác nhận đã thu tiền — luôn dùng lại **cùng `idempotencyKey`**.
   */
  PAYMENT_STATUS_POLL = 'payment-status-poll',
  /** `statements` (10.B): nạp file sao kê → chuẩn hóa → chống trùng → khớp. */
  IMPORT_STATEMENT = 'import-statement',
  /** `statements` (10.B): khớp lại toàn bộ sao kê còn mở + báo cáo lệch tồn đọng. */
  RECONCILIATION_CATCHUP = 'reconciliation-catchup',
  /** `dead-letter`: lưu vết job đã hết số lần thử (không thực thi nghiệp vụ). */
  DEAD_LETTER_ARCHIVE = 'dead-letter-archive',
}

export const ALL_JOB_NAMES: readonly JobName[] = Object.values(JobName);

/**
 * Trạng thái một lượt chạy job.
 *
 * Đây là bản ghi **do hệ thống tự ghi** (append-only từ góc nhìn người dùng):
 * trạng thái đi từ `pending` → `active` → `completed`/`failed` theo vòng đời
 * của job trong BullMQ.
 */
export enum JobRunStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export const ALL_JOB_RUN_STATUSES: readonly JobRunStatus[] = Object.values(JobRunStatus);

export const JOB_RUN_STATUS_LABELS: Record<JobRunStatus, string> = {
  [JobRunStatus.PENDING]: 'Đang chờ',
  [JobRunStatus.ACTIVE]: 'Đang chạy',
  [JobRunStatus.COMPLETED]: 'Hoàn thành',
  [JobRunStatus.FAILED]: 'Thất bại',
};

/** Nguồn kích hoạt job. */
export enum JobTrigger {
  /** Do cron (`@nestjs/schedule`) kích hoạt. */
  SCHEDULE = 'schedule',
  /** Do người dùng gọi API. */
  API = 'api',
  /** Do hệ thống tự sinh (job này sinh job khác). */
  SYSTEM = 'system',
}

export const ALL_JOB_TRIGGERS: readonly JobTrigger[] = Object.values(JobTrigger);

export const JOB_TRIGGER_LABELS: Record<JobTrigger, string> = {
  [JobTrigger.SCHEDULE]: 'Định kỳ',
  [JobTrigger.API]: 'Thủ công (API)',
  [JobTrigger.SYSTEM]: 'Hệ thống',
};

/** Lý do job dừng hẳn (không retry nữa) — lưu vào `job_runs.error`. */
export const DEAD_LETTER_PREFIX = 'Hết số lần thử:';
