/**
 * Trạng thái hóa đơn bán (mục 10.A).
 */
export enum InvoiceStatus {
  /** Nháp — có thể sửa/xóa. */
  DRAFT = 'draft',
  /** Đã xác nhận — chờ ghi sổ. */
  APPROVED = 'approved',
  /** Đã ghi sổ — bất biến, đã sinh bút toán gắn với source. */
  POSTED = 'posted',
  /** Đã hủy/khóa — không sử dụng để phân bổ. */
  VOIDED = 'voided',
}

export const ALL_INVOICE_STATUSES: readonly InvoiceStatus[] = Object.values(InvoiceStatus);

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Nháp',
  [InvoiceStatus.APPROVED]: 'Đã xác nhận',
  [InvoiceStatus.POSTED]: 'Đã ghi sổ',
  [InvoiceStatus.VOIDED]: 'Đã hủy',
};

export function isInvoiceImmutable(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.POSTED || status === InvoiceStatus.VOIDED;
}
