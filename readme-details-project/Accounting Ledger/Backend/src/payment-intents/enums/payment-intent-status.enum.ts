/**
 * Trạng thái một **ý định thanh toán** (mục 10.B — P2.1).
 *
 * Điểm quan trọng nhất của enum này: **`unknown` KHÔNG phải thất bại.**
 * Timeout khi gọi nhà cung cấp chỉ có nghĩa "chưa biết kết quả" — tiền có thể đã
 * bị thu. Vì vậy hệ thống **không** kết luận thất bại, mà tiếp tục tra cứu theo
 * đúng `idempotencyKey` cho tới khi có kết luận (hoặc tới ngưỡng leo thang cho
 * con người xử lý).
 */
export enum PaymentIntentStatus {
  /** Vừa tạo, chưa gọi nhà cung cấp hoặc chưa biết kết quả. */
  INITIATED = 'initiated',
  /** Nhà cung cấp đã giữ tiền (chưa hạch toán). */
  AUTHORIZED = 'authorized',
  /** Đã thu tiền ⇒ **có bút toán** (hạch toán một lần, gắn chứng từ nguồn). */
  CAPTURED = 'captured',
  /** Tiền đã về tài khoản ngân hàng (đối chiếu sao kê — P2.2/P2.3). */
  SETTLED = 'settled',
  /** Nhà cung cấp báo thất bại. */
  FAILED = 'failed',
  /** Đã hoàn tiền. */
  REFUNDED = 'refunded',
  /** Hết hạn chờ thanh toán. */
  EXPIRED = 'expired',
  /**
   * **Chưa xác định được kết quả** (timeout / lỗi mạng / kết quả mâu thuẫn).
   * Job `payment-status-poll` sẽ tra cứu lại cho tới khi kết luận.
   */
  UNKNOWN = 'unknown',
}

export const ALL_PAYMENT_INTENT_STATUSES: readonly PaymentIntentStatus[] =
  Object.values(PaymentIntentStatus);

export const PAYMENT_INTENT_STATUS_LABELS: Record<PaymentIntentStatus, string> = {
  [PaymentIntentStatus.INITIATED]: 'Khởi tạo',
  [PaymentIntentStatus.AUTHORIZED]: 'Đã giữ tiền',
  [PaymentIntentStatus.CAPTURED]: 'Đã thu tiền',
  [PaymentIntentStatus.SETTLED]: 'Đã về tài khoản',
  [PaymentIntentStatus.FAILED]: 'Thất bại',
  [PaymentIntentStatus.REFUNDED]: 'Đã hoàn tiền',
  [PaymentIntentStatus.EXPIRED]: 'Hết hạn',
  [PaymentIntentStatus.UNKNOWN]: 'Chưa xác định',
};

/** Trạng thái **cuối** — không còn thay đổi theo nhà cung cấp nữa. */
const FINAL_STATUSES: readonly PaymentIntentStatus[] = [
  PaymentIntentStatus.CAPTURED,
  PaymentIntentStatus.SETTLED,
  PaymentIntentStatus.FAILED,
  PaymentIntentStatus.REFUNDED,
  PaymentIntentStatus.EXPIRED,
];

export function isFinalIntentStatus(status: PaymentIntentStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/**
 * Còn cần tra cứu nhà cung cấp hay không.
 *
 * `captured` **không** nằm trong danh sách: tiền đã thu thì gọi lại provider là
 * vô nghĩa; việc còn lại là chờ sao kê (`settled`) — thuộc P2.2.
 */
export function canPollProvider(status: PaymentIntentStatus): boolean {
  return (
    status === PaymentIntentStatus.INITIATED ||
    status === PaymentIntentStatus.AUTHORIZED ||
    status === PaymentIntentStatus.UNKNOWN
  );
}

/** Đã có bút toán chưa (chỉ `captured`/`settled` mới được post). */
export function isCaptured(status: PaymentIntentStatus): boolean {
  return (
    status === PaymentIntentStatus.CAPTURED ||
    status === PaymentIntentStatus.SETTLED
  );
}
