/**
 * Trạng thái hóa đơn mua (mục 10.A).
 */
export enum BillStatus {
  /** Nháp — có thể sửa/xóa. */
  DRAFT = 'draft',
  /** Đã xác nhận — chờ ghi sổ. */
  APPROVED = 'approved',
  /** Đã ghi sổ — bất biến, đã sinh bút toán gắn với source. */
  POSTED = 'posted',
  /** Đã hủy/khóa — không sử dụng để phân bổ. */
  VOIDED = 'voided',
}

export const ALL_BILL_STATUSES: readonly BillStatus[] = Object.values(BillStatus);

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  [BillStatus.DRAFT]: 'Nháp',
  [BillStatus.APPROVED]: 'Đã xác nhận',
  [BillStatus.POSTED]: 'Đã ghi sổ',
  [BillStatus.VOIDED]: 'Đã hủy',
};

export function isBillImmutable(status: BillStatus): boolean {
  return status === BillStatus.POSTED || status === BillStatus.VOIDED;
}
