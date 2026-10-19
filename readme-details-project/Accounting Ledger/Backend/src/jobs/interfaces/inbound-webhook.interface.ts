/**
 * Hợp đồng cho **xử lý nghiệp vụ** webhook nhận vào.
 *
 * `WebhooksService` chỉ làm phần vận chuyển (xác thực chữ ký, chống trùng, lưu
 * vết). Module nghiệp vụ đăng ký handler theo `eventType` để áp kết quả vào dữ
 * liệu của mình. Nhờ vậy tầng webhook **không** phụ thuộc ngược vào payment
 * intents (tránh vòng import `JobsModule ↔ PaymentIntentsModule`).
 *
 * Thứ tự trong `receiveInbound`: chạy handler **trước** khi lưu sự kiện. Nếu
 * handler ném lỗi, chưa có bản ghi nào được lưu ⇒ bên gửi nhận 5xx và retry;
 * mọi thao tác áp kết quả đều idempotent nên retry an toàn.
 */
export interface InboundWebhookHandlerInput {
  /** Mã sự kiện phía hệ thống ngoài (idempotency key). */
  externalId: string;
  /** `payment.captured`, `payment.failed`, … */
  eventType: string;
  /** Id đối tượng nghiệp vụ (với thanh toán: id payment intent). */
  resourceRef: string;
  occurredAt: Date;
  /** Toàn bộ payload đã nhận — bằng chứng để điều tra. */
  payload: Record<string, unknown>;
}

export interface InboundWebhookHandlerResult {
  /** Đã áp vào nghiệp vụ chưa (không áp được vì mâu thuẫn vẫn là đã xử lý). */
  applied: boolean;
  /** Ghi chú lưu vào log, vd lý do bỏ qua. */
  note?: string | null;
}

export type InboundWebhookHandler = (
  input: InboundWebhookHandlerInput,
) => Promise<InboundWebhookHandlerResult>;
