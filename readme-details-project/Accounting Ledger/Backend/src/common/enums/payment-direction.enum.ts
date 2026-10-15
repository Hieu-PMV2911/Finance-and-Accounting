/**
 * Chiều tiền của phiếu (mục 10.A).
 *
 * Một bảng chứ không hai: phiếu thu và phiếu chi dùng chung mọi trường (đối tượng,
 * số tiền, phương thức, tài khoản tiền) và chỉ khác chiều hạch toán. Hai bảng sẽ nhân
 * đôi code mà không thêm bất biến nào — cùng lý do như `parties`.
 */
export enum PaymentDirection {
  /** Phiếu thu: Nợ 111/112 / Có 131 (khách trả nợ). */
  RECEIPT = 'receipt',
  /** Phiếu chi: Nợ 331 / Có 111/112 (trả nợ nhà cung cấp). */
  PAYMENT = 'payment',
}

export const ALL_PAYMENT_DIRECTIONS: readonly PaymentDirection[] =
  Object.values(PaymentDirection);

export const PAYMENT_DIRECTION_LABELS: Record<PaymentDirection, string> = {
  [PaymentDirection.RECEIPT]: 'Phiếu thu',
  [PaymentDirection.PAYMENT]: 'Phiếu chi',
};
