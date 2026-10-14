/**
 * Loại đối tượng của sổ cái phụ (mục 10.0).
 *
 * Một đối tượng có thể vừa là khách hàng vừa là nhà cung cấp (BOTH) — thực tế
 * rất phổ biến: cùng một công ty vừa bán hàng cho mình vừa mua hàng của mình.
 * Vì vậy không tách thành hai bảng; loại chỉ dùng để **lọc** và để gợi ý tài
 * khoản công nợ (131 cho phải thu, 331 cho phải trả).
 */
export enum PartyType {
  /** Khách hàng — phát sinh phải thu (TK 131). */
  CUSTOMER = 'customer',
  /** Nhà cung cấp — phát sinh phải trả (TK 331). */
  VENDOR = 'vendor',
  /** Vừa khách hàng vừa nhà cung cấp. */
  BOTH = 'both',
}

export const ALL_PARTY_TYPES: readonly PartyType[] = Object.values(PartyType);

/** Nhãn tiếng Việt để hiển thị / seed dữ liệu. */
export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  [PartyType.CUSTOMER]: 'Khách hàng',
  [PartyType.VENDOR]: 'Nhà cung cấp',
  [PartyType.BOTH]: 'Khách hàng & Nhà cung cấp',
};

/** Có thể phát sinh phải thu? (`customer` hoặc `both`) */
export function isCustomer(type: PartyType): boolean {
  return type === PartyType.CUSTOMER || type === PartyType.BOTH;
}

/** Có thể phát sinh phải trả? (`vendor` hoặc `both`) */
export function isVendor(type: PartyType): boolean {
  return type === PartyType.VENDOR || type === PartyType.BOTH;
}
