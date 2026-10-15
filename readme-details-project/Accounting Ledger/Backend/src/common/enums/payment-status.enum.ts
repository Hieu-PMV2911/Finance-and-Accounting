/**
 * Trạng thái phiếu thu/chi (mục 10.A) — cùng vòng đời với bút toán:
 * `draft → approved → posted → voided`.
 *
 * Chỉ phiếu **đã ghi sổ** mới được phân bổ vào hóa đơn: phân bổ là lớp phân tích công
 * nợ, dựa trên bút toán đã thật sự vào sổ. Phân bổ trước khi ghi sổ sẽ tạo ra công nợ
 * trỏ vào một khoản tiền chưa tồn tại.
 */
export enum PaymentStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  POSTED = 'posted',
  VOIDED = 'voided',
}

export const ALL_PAYMENT_STATUSES: readonly PaymentStatus[] =
  Object.values(PaymentStatus);

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.DRAFT]: 'Nháp',
  [PaymentStatus.APPROVED]: 'Đã xác nhận',
  [PaymentStatus.POSTED]: 'Đã ghi sổ',
  [PaymentStatus.VOIDED]: 'Đã hủy',
};

export function isPaymentImmutable(status: PaymentStatus): boolean {
  return status === PaymentStatus.POSTED || status === PaymentStatus.VOIDED;
}
