/**
 * 5 loại tài khoản kế toán (chuẩn VN — TT200/TT133).
 *
 * Nhóm tài khoản quyết định **số dư bình thường** (normal balance):
 * - Tài sản & Chi phí → số dư bên **Nợ** (debit).
 * - Nợ phải trả, Vốn chủ sở hữu & Doanh thu → số dư bên **Có** (credit).
 */
export enum AccountType {
  /** Tài sản (TK loại 1, 2 — vd: 111 Tiền mặt, 112 Tiền gửi NH). */
  ASSET = 'asset',
  /** Nợ phải trả (TK loại 3 — vd: 331 Phải trả người bán). */
  LIABILITY = 'liability',
  /** Vốn chủ sở hữu (TK loại 4 — vd: 411 Vốn đầu tư chủ sở hữu). */
  EQUITY = 'equity',
  /** Doanh thu (TK loại 5, 7 — vd: 511 Doanh thu bán hàng). */
  REVENUE = 'revenue',
  /** Chi phí (TK loại 6, 8 — vd: 642 Chi phí quản lý kinh doanh). */
  EXPENSE = 'expense',
}

export const ALL_ACCOUNT_TYPES: readonly AccountType[] = Object.values(AccountType);

/** Nhãn tiếng Việt để hiển thị / seed dữ liệu. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.ASSET]: 'Tài sản',
  [AccountType.LIABILITY]: 'Nợ phải trả',
  [AccountType.EQUITY]: 'Vốn chủ sở hữu',
  [AccountType.REVENUE]: 'Doanh thu',
  [AccountType.EXPENSE]: 'Chi phí',
};

export type NormalBalance = 'debit' | 'credit';

/** Số dư bình thường của một loại tài khoản (dùng cho báo cáo/tính số dư). */
export function normalBalanceOf(type: AccountType): NormalBalance {
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? 'debit'
    : 'credit';
}
