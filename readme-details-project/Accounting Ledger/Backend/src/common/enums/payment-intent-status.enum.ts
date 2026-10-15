/**
 * Trạng thái một **yêu cầu thanh toán** (`payment_intents`) — mục 10.B.
 *
 * Yêu cầu gốc của dự án: *"giải thích được vì sao timeout không đồng nghĩa với
 * thanh toán thất bại, và cách phục hồi mà không tạo giao dịch trùng"*.
 *
 * Vì vậy vòng đời **bắt buộc** có hai nhánh "chưa biết":
 *
 * ```
 * initiated ─▶ authorized ─▶ captured ─▶ settled
 *     │             │            │
 *     │             └──▶ failed  └──▶ refunded
 *     └──▶ expired          ▲
 *                           └── unknown / pending_verification   ← timeout KHÔNG phải thất bại
 * ```
 *
 * `UNKNOWN` = mất kết nối tới provider: **ta mất thông tin, không phải giao dịch
 * biến mất**. Không được post "thất bại", không được kết luận — chỉ được tra cứu
 * lại (`payment-status-poll`) cho tới khi có **bằng chứng kết luận**.
 *
 * `PENDING_VERIFICATION` = đã có tín hiệu mâu thuẫn (vd webhook nói captured nhưng
 * tra cứu chưa xác nhận) ⇒ cần người/tiến trình xác minh, vẫn **không** tự suy diễn.
 */
export enum PaymentIntentStatus {
  /** Vừa tạo, chưa gửi yêu cầu tới provider. */
  INITIATED = 'initiated',
  /** Provider đã giữ tiền (authorize) nhưng chưa thu. */
  AUTHORIZED = 'authorized',
  /** Provider đã thu tiền — đã ghi sổ. */
  CAPTURED = 'captured',
  /** Đã đối soát xong với sao kê — trạng thái cuối "thành công". */
  SETTLED = 'settled',
  /** Thất bại **có bằng chứng** (provider trả lỗi kết luận). */
  FAILED = 'failed',
  /** Đã hoàn tiền. */
  REFUNDED = 'refunded',
  /** Hết hạn uỷ quyền mà chưa thu được. */
  EXPIRED = 'expired',
  /** **Chưa biết** — timeout/mất kết nối. Phải tra cứu lại, không kết luận. */
  UNKNOWN = 'unknown',
  /** Đang xác minh với provider (tín hiệu chưa đủ để kết luận). */
  PENDING_VERIFICATION = 'pending_verification',
}

export const ALL_PAYMENT_INTENT_STATUSES: readonly PaymentIntentStatus[] =
  Object.values(PaymentIntentStatus);

export const PAYMENT_INTENT_STATUS_LABELS: Record<PaymentIntentStatus, string> = {
  [PaymentIntentStatus.INITIATED]: 'Khởi tạo',
  [PaymentIntentStatus.AUTHORIZED]: 'Đã giữ tiền',
  [PaymentIntentStatus.CAPTURED]: 'Đã thu tiền',
  [PaymentIntentStatus.SETTLED]: 'Đã tất toán',
  [PaymentIntentStatus.FAILED]: 'Thất bại',
  [PaymentIntentStatus.REFUNDED]: 'Đã hoàn tiền',
  [PaymentIntentStatus.EXPIRED]: 'Hết hạn',
  [PaymentIntentStatus.UNKNOWN]: 'Chưa biết (timeout)',
  [PaymentIntentStatus.PENDING_VERIFICATION]: 'Đang xác minh',
};

/**
 * Trạng thái **đã kết luận** — không cần tra cứu lại nữa.
 * `UNKNOWN` và `PENDING_VERIFICATION` **không** nằm trong đây: đó là điểm mấu chốt
 * của 10.B, gộp chúng vào "kết luận" là tự biến timeout thành thất bại.
 */
export function isConclusiveIntentStatus(status: PaymentIntentStatus): boolean {
  return (
    status === PaymentIntentStatus.SETTLED ||
    status === PaymentIntentStatus.FAILED ||
    status === PaymentIntentStatus.REFUNDED ||
    status === PaymentIntentStatus.EXPIRED
  );
}

/** Trạng thái cuối — không thể chuyển tiếp nữa. */
export function isTerminalIntentStatus(status: PaymentIntentStatus): boolean {
  return isConclusiveIntentStatus(status);
}

/** Cần tra cứu lại với provider (job `payment-status-poll` quét nhóm này). */
export function needsProviderPoll(status: PaymentIntentStatus): boolean {
  return (
    status === PaymentIntentStatus.INITIATED ||
    status === PaymentIntentStatus.AUTHORIZED ||
    status === PaymentIntentStatus.UNKNOWN ||
    status === PaymentIntentStatus.PENDING_VERIFICATION
  );
}

/** Đã thu được tiền (đã hoặc sẽ ghi sổ). */
export function isCapturedIntentStatus(status: PaymentIntentStatus): boolean {
  return (
    status === PaymentIntentStatus.CAPTURED ||
    status === PaymentIntentStatus.SETTLED
  );
}
