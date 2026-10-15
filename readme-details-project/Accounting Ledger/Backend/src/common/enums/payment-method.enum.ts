/**
 * Phương thức thanh toán (mục 10.A).
 *
 * Dùng để **suy ra tài khoản tiền** khi ghi sổ (`111` tiền mặt, `112` tiền gửi ngân hàng).
 * `OTHER` không suy ra được ⇒ bắt buộc khai `cashAccountId` trên phiếu, không đoán.
 */
export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  OTHER = 'other',
}

export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] =
  Object.values(PaymentMethod);

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Tiền mặt',
  [PaymentMethod.BANK_TRANSFER]: 'Chuyển khoản',
  [PaymentMethod.OTHER]: 'Khác',
};

/** Tiền tố tài khoản tiền mặc định theo phương thức (`null` = phải khai tay). */
export const PAYMENT_METHOD_ACCOUNT_PREFIX: Record<PaymentMethod, string | null> = {
  [PaymentMethod.CASH]: '111',
  [PaymentMethod.BANK_TRANSFER]: '112',
  [PaymentMethod.OTHER]: null,
};
