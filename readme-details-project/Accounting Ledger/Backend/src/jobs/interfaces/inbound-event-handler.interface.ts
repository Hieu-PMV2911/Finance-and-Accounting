/**
 * Bộ điều phối **webhook nhận vào** (mục 9 → dùng cho mục 10.B).
 *
 * Vấn đề cần giải: `WebhooksService` (mục 9) biết cách *nhận* một sự kiện an toàn
 * (chống trùng, phát hiện đến trễ, kiểm chữ ký) nhưng **không** được biết nghiệp
 * vụ của từng loại sự kiện — nếu biết, mục 9 sẽ phụ thuộc ngược vào mục 10 và
 * thêm một loại sự kiện mới lại phải sửa lõi webhook.
 *
 * Cách tách: mục 9 chỉ **phát** sự kiện đã được chấp nhận cho các handler đã đăng
 * ký. Module nghiệp vụ (vd thanh toán) tự đăng ký handler của mình ⇒ không có phụ
 * thuộc vòng, và thêm loại sự kiện mới chỉ là thêm một handler.
 */
export interface InboundEventContext {
  /** Id dòng `webhook_events` đã lưu (dùng để truy vết ngược). */
  eventId: string;
  /** Id sự kiện do hệ thống ngoài sinh (`externalId`). */
  externalId: string;
  eventType: string;
  resourceRef: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface InboundEventOutcome {
  /** `false` = sự kiện hợp lệ nhưng không có gì để áp dụng (vd không tìm thấy đối tượng). */
  handled: boolean;
  /** Chi tiết để ghi vào log/kiểm toán. */
  detail?: Record<string, unknown> | null;
}

export interface InboundEventHandler {
  /** Tên handler — hiện trong log. */
  readonly name: string;
  /** Loại sự kiện mà handler này xử lý (vd `payment.captured`). */
  supports(eventType: string): boolean;
  handle(context: InboundEventContext): Promise<InboundEventOutcome>;
}
