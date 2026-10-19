/**
 * Trạng thái một sao kê ngân hàng (mục 10.B — P2.2).
 *
 * Vòng đời: `imported → reconciled`. Chốt (`reconciled`) là **bất biến**: mọi
 * dòng trong sao kê đã khớp hết, không được tự ý mở lại — muốn sửa thì đối soát
 * lại bằng dòng điều chỉnh, không xóa lịch sử.
 */
export enum BankStatementStatus {
  /** Đã nạp dòng ghi có/ghi nợ, chờ đối soát. */
  IMPORTED = 'imported',
  /** Đã đối soát xong — mọi dòng đều có đối ứng. */
  RECONCILED = 'reconciled',
}

export const ALL_BANK_STATEMENT_STATUSES: readonly BankStatementStatus[] =
  Object.values(BankStatementStatus);

export const BANK_STATEMENT_STATUS_LABELS: Record<BankStatementStatus, string> = {
  [BankStatementStatus.IMPORTED]: 'Đã nạp, chờ đối soát',
  [BankStatementStatus.RECONCILED]: 'Đã đối soát xong',
};

/** Đã chốt đối soát ⇒ mọi dòng bên trong đóng băng. */
export function isStatementImmutable(status: BankStatementStatus): boolean {
  return status === BankStatementStatus.RECONCILED;
}
