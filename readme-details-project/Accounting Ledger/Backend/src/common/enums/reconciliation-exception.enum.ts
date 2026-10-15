/**
 * Danh sách **giao dịch lệch** trong đối soát (mục 10.B).
 *
 * Yêu cầu gốc: *"danh sách giao dịch lệch & xử lý thủ công"*. Điểm cốt lõi là
 * **không tự đoán**: khi hai bên (nội bộ ↔ sao kê) không khớp được, hệ thống ghi
 * lại một dòng lệch có phân loại, để con người xử lý và mọi hành động đều có vết
 * kiểm toán. Im lặng bỏ qua phần lệch là cách nhanh nhất để sổ sách sai mà không ai biết.
 */
export enum ReconciliationExceptionType {
  /** Có ở sao kê ngân hàng nhưng **không** có chứng từ nội bộ (khoản thu/chi chưa ghi sổ). */
  MISSING_INTERNAL = 'missing_internal',
  /** Có chứng từ nội bộ nhưng **không** thấy trên sao kê (đã ghi sổ mà ngân hàng chưa báo). */
  MISSING_STATEMENT = 'missing_statement',
  /** Khớp được đối tượng/ngày nhưng **lệch số tiền**. */
  AMOUNT_MISMATCH = 'amount_mismatch',
  /** Một khoản nội bộ bị khớp với nhiều dòng sao kê ⇒ nghi thu trùng. */
  DUPLICATE_PAYMENT = 'duplicate_payment',
  /** Kết quả thanh toán **đến trễ** và mâu thuẫn với trạng thái đã chốt của intent. */
  LATE_EVENT_CONFLICT = 'late_event_conflict',
}

export const ALL_RECONCILIATION_EXCEPTION_TYPES: readonly ReconciliationExceptionType[] =
  Object.values(ReconciliationExceptionType);

export const RECONCILIATION_EXCEPTION_TYPE_LABELS: Record<
  ReconciliationExceptionType,
  string
> = {
  [ReconciliationExceptionType.MISSING_INTERNAL]: 'Thiếu chứng từ nội bộ',
  [ReconciliationExceptionType.MISSING_STATEMENT]: 'Thiếu trên sao kê',
  [ReconciliationExceptionType.AMOUNT_MISMATCH]: 'Lệch số tiền',
  [ReconciliationExceptionType.DUPLICATE_PAYMENT]: 'Nghi thu trùng',
  [ReconciliationExceptionType.LATE_EVENT_CONFLICT]: 'Kết quả đến trễ mâu thuẫn',
};

/** Vòng đời xử lý một dòng lệch. */
export enum ReconciliationExceptionStatus {
  /** Chưa xử lý. */
  OPEN = 'open',
  /** Đã xử lý (có thể kèm bút toán phí/lãi ngân hàng). */
  RESOLVED = 'resolved',
  /** Đã xem xét và **chấp nhận** chênh lệch (có lý do). */
  IGNORED = 'ignored',
}

export const ALL_RECONCILIATION_EXCEPTION_STATUSES: readonly ReconciliationExceptionStatus[] =
  Object.values(ReconciliationExceptionStatus);

export const RECONCILIATION_EXCEPTION_STATUS_LABELS: Record<
  ReconciliationExceptionStatus,
  string
> = {
  [ReconciliationExceptionStatus.OPEN]: 'Chưa xử lý',
  [ReconciliationExceptionStatus.RESOLVED]: 'Đã xử lý',
  [ReconciliationExceptionStatus.IGNORED]: 'Bỏ qua (có lý do)',
};
