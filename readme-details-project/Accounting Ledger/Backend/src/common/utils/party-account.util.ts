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
