import type { AccountType } from '../../common/enums/account-type.enum.js';

/** Một dòng phát sinh cần cộng/trừ vào số dư. */
export interface LedgerMovement {
  accountId: string;
  debit: string;
  credit: string;
}

/** Số dư một tài khoản trong một kỳ, kèm số dư cuối kỳ đã tính sẵn. */
export interface AccountBalanceView {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: string;
  openingCredit: string;
  debitTotal: string;
  creditTotal: string;
  /**
   * Số dư cuối kỳ, phần **dư Nợ**:
   * `(openingDebit − openingCredit) + (debitTotal − creditTotal)`, chỉ lấy khi dương.
   */
  closingDebit: string;
  /** Số dư cuối kỳ, phần **dư Có** — trị tuyệt đối khi số dư thuần âm. */
  closingCredit: string;
}
