/**
 * Tài khoản nào được phép gắn **đối tượng** (sổ cái phụ) — mục 10.0.
 *
 * Vì sao giới hạn: gắn khách hàng vào một dòng doanh thu (511) hay tiền mặt (111)
 * là vô nghĩa nghiệp vụ và sẽ làm báo cáo công nợ theo đối tượng sai ngay từ gốc.
 * Chỉ tài khoản công nợ mới có nghĩa "ai đang nợ mình / mình nợ ai".
 *
 * Dùng tiền tố mã tài khoản theo TT200: 131 (phải thu khách hàng),
 * 331 (phải trả người bán). Muốn mở rộng (vd 1388, 3388) chỉ cần thêm tiền tố ở đây.
 */
export const PARTY_ACCOUNT_PREFIXES: readonly string[] = ['131', '331'];

/** Mã tài khoản có phải tài khoản công nợ (được phép gắn đối tượng)? */
export function isPartyAccount(code: string): boolean {
  return PARTY_ACCOUNT_PREFIXES.some((prefix) => code.startsWith(prefix));
}

/** Thông báo dùng chung khi gắn đối tượng sai tài khoản. */
export function partyAccountMessage(code: string): string {
  return (
    `Tài khoản ${code} không phải tài khoản công nợ — chỉ tài khoản ` +
    `${PARTY_ACCOUNT_PREFIXES.join('/')} mới gắn được đối tượng`
  );
}

/** Chiều số dư tự nhiên của tài khoản công nợ. */
export type PartyAccountSide = 'receivable' | 'payable';

/** TK 131 — phải thu khách hàng: số dư tự nhiên bên **Nợ**. */
export const RECEIVABLE_ACCOUNT_PREFIX = '131';

/** TK 331 — phải trả người bán: số dư tự nhiên bên **Có**. */
export const PAYABLE_ACCOUNT_PREFIX = '331';

/**
 * Chiều công nợ của một tài khoản (mục 10.C.1).
 *
 * Vì sao cần phân biệt: chênh lệch tỷ giá **cùng một con số** mang nghĩa ngược nhau
 * tuỳ chiều công nợ. Khách trả nhiều tiền hơn giá trị đã ghi nhận là **lãi** với
 * phải thu (131), nhưng trả nhiều hơn cho nhà cung cấp là **lỗ** với phải trả (331).
 * Nhầm chiều ở đây sẽ đảo dấu toàn bộ bút toán chênh lệch — lãi thành lỗ.
 */
export function partyAccountSide(code: string): PartyAccountSide | null {
  if (code.startsWith(RECEIVABLE_ACCOUNT_PREFIX)) return 'receivable';
  if (code.startsWith(PAYABLE_ACCOUNT_PREFIX)) return 'payable';
  return null;
}
