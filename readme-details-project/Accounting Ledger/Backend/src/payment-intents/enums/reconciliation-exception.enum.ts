/**
 * Loại **ngoại lệ đối soát** (mục 10.B).
 *
 * Ngoại lệ là chỗ hệ thống **không được phép tự đoán**: hai nguồn sự thật (sổ
 * nội bộ và sao kê/nhà cung cấp) nói khác nhau thì phải để lại một bản ghi cho
 * con người xử lý, thay vì âm thầm chọn một bên.
 */
export enum ReconciliationExceptionType {
  /** Sao kê/nhà cung cấp có, sổ nội bộ không có. */
  MISSING_INTERNAL = 'missing_internal',
  /** Sổ nội bộ có, sao kê không có. */
  MISSING_STATEMENT = 'missing_statement',
  /** Số tiền hai bên lệch nhau. */
  AMOUNT_MISMATCH = 'amount_mismatch',
  /** Nghi ngờ thu/chi hai lần cho cùng một nghĩa vụ. */
  DUPLICATE_PAYMENT = 'duplicate_payment',
  /**
   * **Kết quả đến trễ mâu thuẫn trạng thái cuối** (P2.1): giao dịch đã ở trạng
   * thái cuối nhưng nhà cung cấp vẫn báo một kết quả khác ⇒ **không ghi đè**.
   */
  LATE_EVENT_CONFLICT = 'late_event_conflict',
  /**
   * Quá ngưỡng số lần tra cứu mà nhà cung cấp vẫn chưa kết luận (P2.1) ⇒ leo
   * thang cho con người, không tự suy diễn thất bại.
   */
  UNRESOLVED_PROVIDER_STATUS = 'unresolved_provider_status',
}

export const ALL_RECONCILIATION_EXCEPTION_TYPES: readonly ReconciliationExceptionType[] =
  Object.values(ReconciliationExceptionType);

export const RECONCILIATION_EXCEPTION_TYPE_LABELS: Record<
  ReconciliationExceptionType,
  string
> = {
  [ReconciliationExceptionType.MISSING_INTERNAL]: 'Sổ nội bộ thiếu',
  [ReconciliationExceptionType.MISSING_STATEMENT]: 'Sao kê thiếu',
  [ReconciliationExceptionType.AMOUNT_MISMATCH]: 'Lệch số tiền',
  [ReconciliationExceptionType.DUPLICATE_PAYMENT]: 'Nghi thu/chi trùng',
  [ReconciliationExceptionType.LATE_EVENT_CONFLICT]:
    'Kết quả đến trễ mâu thuẫn',
  [ReconciliationExceptionType.UNRESOLVED_PROVIDER_STATUS]:
    'Nhà cung cấp chưa kết luận',
};

/** Trạng thái xử lý một ngoại lệ. */
export enum ReconciliationExceptionStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  IGNORED = 'ignored',
}

export const ALL_RECONCILIATION_EXCEPTION_STATUSES: readonly ReconciliationExceptionStatus[] =
  Object.values(ReconciliationExceptionStatus);

export const RECONCILIATION_EXCEPTION_STATUS_LABELS: Record<
  ReconciliationExceptionStatus,
  string
> = {
  [ReconciliationExceptionStatus.OPEN]: 'Đang mở',
  [ReconciliationExceptionStatus.RESOLVED]: 'Đã xử lý',
  [ReconciliationExceptionStatus.IGNORED]: 'Bỏ qua',
};
