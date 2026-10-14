/** Sự kiện nghiệp vụ có thể phát webhook ra ngoài. */
export enum WebhookEventType {
  /** Bút toán đã ghi sổ. */
  JOURNAL_POSTED = 'journal.posted',
  /** Bút toán đã bị đảo. */
  JOURNAL_REVERSED = 'journal.reversed',
  /** Kỳ kế toán đã chốt. */
  PERIOD_CLOSED = 'period.closed',
  /** Phát hiện vi phạm bất biến. */
  INTEGRITY_VIOLATION = 'integrity.violation',
  /** Webhook thử nghiệm (gọi từ giao diện để kiểm tra endpoint). */
  PING = 'ping',
}

export const ALL_WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] =
  Object.values(WebhookEventType);

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  [WebhookEventType.JOURNAL_POSTED]: 'Bút toán đã ghi sổ',
  [WebhookEventType.JOURNAL_REVERSED]: 'Bút toán đã đảo',
  [WebhookEventType.PERIOD_CLOSED]: 'Kỳ kế toán đã chốt',
  [WebhookEventType.INTEGRITY_VIOLATION]: 'Vi phạm bất biến',
  [WebhookEventType.PING]: 'Thử nghiệm',
};

/**
 * Trạng thái một lần giao webhook **ra ngoài**.
 *
 * - `pending` : đang chờ gửi (hoặc chờ retry).
 * - `delivered`: endpoint trả 2xx.
 * - `failed`  : đã thử hết số lần nhưng vẫn lỗi.
 */
export enum WebhookDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export const ALL_WEBHOOK_DELIVERY_STATUSES: readonly WebhookDeliveryStatus[] =
  Object.values(WebhookDeliveryStatus);

export const WEBHOOK_DELIVERY_STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
  [WebhookDeliveryStatus.PENDING]: 'Đang chờ',
  [WebhookDeliveryStatus.DELIVERED]: 'Đã giao',
  [WebhookDeliveryStatus.FAILED]: 'Thất bại',
};

/**
 * Kết quả xử lý một webhook **nhận vào** (kết quả thanh toán/đối soát đến từ
 * hệ thống ngoài).
 *
 * `LATE` là trường hợp "kết quả đến trễ": sự kiện tới sau khi trạng thái của
 * cùng đối tượng (`resourceRef`) đã được chốt bởi một sự kiện mới hơn — bản ghi
 * vẫn được lưu để kiểm toán nhưng **không** được áp vào nghiệp vụ.
 */
export enum WebhookEventStatus {
  PROCESSED = 'processed',
  DUPLICATE = 'duplicate',
  LATE = 'late',
  REJECTED = 'rejected',
}

export const ALL_WEBHOOK_EVENT_STATUSES: readonly WebhookEventStatus[] =
  Object.values(WebhookEventStatus);

export const WEBHOOK_EVENT_STATUS_LABELS: Record<WebhookEventStatus, string> = {
  [WebhookEventStatus.PROCESSED]: 'Đã xử lý',
  [WebhookEventStatus.DUPLICATE]: 'Trùng lặp (bỏ qua)',
  [WebhookEventStatus.LATE]: 'Đến trễ (bỏ qua)',
  [WebhookEventStatus.REJECTED]: 'Bị từ chối',
};

/** Header mang chữ ký HMAC-SHA256 của payload webhook. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

/** Header mang mã sự kiện (idempotency key) của webhook nhận vào. */
export const WEBHOOK_ID_HEADER = 'x-webhook-id';

/** Cách tính chữ ký: `sha256=<hex>` của raw body, khóa = secret của endpoint. */
export const WEBHOOK_SIGNATURE_PREFIX = 'sha256=';
