import type {
  AccountType,
  NormalBalance,
} from '../../common/enums/account-type.enum.js';

/** Nút tài khoản trong cây phân cấp trả về cho client. */
export interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isPostable: boolean;
  isActive: boolean;
  description: string | null;
  normalBalance: NormalBalance;
  /** Cấp trong cây (gốc = 1). */
  level: number;
  children: AccountNode[];
}
