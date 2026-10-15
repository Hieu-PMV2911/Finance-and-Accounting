/**
 * Loại sự kiện **thanh toán nhận từ provider** (mục 10.B).
 *
 * Provider gửi qua `POST /api/webhooks/inbound` (hạ tầng mục 9: idempotent theo
 * `id`, phát hiện đến trễ, kiểm chữ ký HMAC). Tầng vận chuyển **không** biết
 * nghiệp vụ — nó chỉ chuyển sự kiện đã hợp lệ cho handler đã đăng ký.
 *
 * `resourceRef` của sự kiện phải là **id của payment intent** (hoặc mã tham chiếu
 * provider) để handler tìm được đối tượng.
 */
export enum ProviderPaymentEventType {
  AUTHORIZED = 'payment.authorized',
  CAPTURED = 'payment.captured',
  FAILED = 'payment.failed',
  REFUNDED = 'payment.refunded',
  EXPIRED = 'payment.expired',
}

export const ALL_PROVIDER_PAYMENT_EVENT_TYPES: readonly ProviderPaymentEventType[] =
  Object.values(ProviderPaymentEventType);

export const PROVIDER_PAYMENT_EVENT_LABELS: Record<ProviderPaymentEventType, string> = {
  [ProviderPaymentEventType.AUTHORIZED]: 'Provider đã giữ tiền',
  [ProviderPaymentEventType.CAPTURED]: 'Provider đã thu tiền',
  [ProviderPaymentEventType.FAILED]: 'Provider báo thất bại',
  [ProviderPaymentEventType.REFUNDED]: 'Provider đã hoàn tiền',
  [ProviderPaymentEventType.EXPIRED]: 'Uỷ quyền hết hạn',
};

export function isProviderPaymentEventType(
  value: string,
): value is ProviderPaymentEventType {
  return ALL_PROVIDER_PAYMENT_EVENT_TYPES.includes(value as ProviderPaymentEventType);
}
