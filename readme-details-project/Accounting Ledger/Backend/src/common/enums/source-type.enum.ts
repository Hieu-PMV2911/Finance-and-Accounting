/**
 * Loại **chứng từ nguồn** sinh ra bút toán (mục 10.0).
 *
 * Mục tiêu nghiệp vụ: truy ngược từ báo cáo → bút toán → **chứng từ nguồn** → lịch
 * sử thay đổi. `reference` (số chứng từ) chỉ là chuỗi tự do, không đủ để kiểm soát
 * "một chứng từ nguồn chỉ sinh **một** bút toán gốc" — nên cần cặp
 * `(sourceType, sourceId)` và một unique index ở DB.
 *
 * `MANUAL` = bút toán nhập tay (không có chứng từ nguồn) — mọi loại khác **bắt buộc**
 * phải có `sourceId`.
 */
export enum SourceType {
  /** Nhập tay trên màn hình bút toán. */
  MANUAL = 'manual',
  /** Hóa đơn bán (mục 10.A). */
  SALES_INVOICE = 'sales_invoice',
  /** Hóa đơn mua (mục 10.A). */
  VENDOR_BILL = 'vendor_bill',
  /** Phiếu thu / phiếu chi (mục 10.A). */
  PAYMENT = 'payment',
  /** Dòng sao kê ngân hàng dùng để hạch toán (mục 10.B). */
  BANK_TRANSACTION = 'bank_transaction',
  /** Sự kiện thanh toán từ provider (mục 10.B). */
  PROVIDER_EVENT = 'provider_event',
}

export const ALL_SOURCE_TYPES: readonly SourceType[] = Object.values(SourceType);

/** Loại chứng từ buộc phải có `sourceId` (mọi loại trừ `MANUAL`). */
export function requiresSourceId(type: SourceType): boolean {
  return type !== SourceType.MANUAL;
}
