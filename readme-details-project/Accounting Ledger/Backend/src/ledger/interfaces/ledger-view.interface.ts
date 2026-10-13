import type {
  AccountType,
  NormalBalance,
} from '../../common/enums/account-type.enum.js';

/**
 * Read-model của sổ cái (mục 6).
 *
 * Toàn bộ số dư ở đây được **tính lại từ `journal_lines` của các bút toán đã
 * ghi sổ** (`posted` / `reversed`) chứ không đọc từ bảng tổng hợp — nhờ vậy sổ
 * cái luôn tra được cho **mọi khoảng ngày**, không phụ thuộc kỳ đã chốt hay chưa,
 * và cũng chính là nguồn để đối chiếu với `account_balances`.
 *
 * Bút toán đảo cũng là bút toán đã ghi sổ và có Nợ/Có hoán đổi, nên khi cộng cả
 * bản gốc lẫn bản đảo thì chúng tự triệt tiêu — đúng với thực tế đã hạch toán.
 */

/** Một dòng phát sinh trên sổ cái chi tiết, kèm số dư lũy kế sau dòng đó. */
export interface GeneralLedgerLine {
  journalEntryId: string;
  /** Số hiệu chứng từ (null với bút toán chưa ghi sổ — không xuất hiện ở đây). */
  entryNo: string | null;
  date: string;
  description: string;
  reference: string | null;
  lineDescription: string | null;
  debit: string;
  credit: string;
  /** Số dư lũy kế (thuần) sau dòng này — phần dư Nợ. */
  balanceDebit: string;
  /** Số dư lũy kế (thuần) sau dòng này — phần dư Có. */
  balanceCredit: string;
}

/** Sổ cái chi tiết của một tài khoản trong một khoảng ngày. */
export interface GeneralLedgerView {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  /** Khoảng ngày đã truy vấn (`YYYY-MM-DD`). */
  fromDate: string;
  toDate: string;
  periodId: string | null;
  periodCode: string | null;
  /** Số dư đầu kỳ = lũy kế của mọi bút toán đã ghi sổ trước `fromDate`. */
  openingDebit: string;
  openingCredit: string;
  lines: GeneralLedgerLine[];
  totalDebit: string;
  totalCredit: string;
  closingDebit: string;
  closingCredit: string;
}

/** Một dòng của bảng cân đối số phát sinh (trial balance). */
export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: string;
  openingCredit: string;
  debitTotal: string;
  creditTotal: string;
  closingDebit: string;
  closingCredit: string;
}

export interface TrialBalanceTotals {
  openingDebit: string;
  openingCredit: string;
  debitTotal: string;
  creditTotal: string;
  closingDebit: string;
  closingCredit: string;
}

/**
 * Bảng cân đối số phát sinh.
 *
 * `balanced = true` khi Σ dư cuối Nợ = Σ dư cuối Có — đây là kiểm tra sức khỏe
 * của toàn bộ sổ: nếu lệch thì dữ liệu bút toán đã sai ở đâu đó.
 */
export interface TrialBalanceView {
  fromDate: string;
  toDate: string;
  periodId: string | null;
  periodCode: string | null;
  rows: TrialBalanceRow[];
  totals: TrialBalanceTotals;
  balanced: boolean;
}

/** Chênh lệch giữa số dư đã lưu và số dư tái lập từ bút toán. */
export interface ReconciliationRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  storedOpeningNet: string;
  computedOpeningNet: string;
  storedDebitTotal: string;
  computedDebitTotal: string;
  storedCreditTotal: string;
  computedCreditTotal: string;
  /** Các trường lệch (rỗng ⇒ dòng này khớp). */
  mismatched: string[];
}

/** Kết quả đối chiếu `account_balances` với `journal_lines` của một kỳ. */
export interface ReconciliationView {
  periodId: string;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
  checkedAt: string;
  /** `true` ⇒ mọi tài khoản khớp, bảng số dư tái lập được từ bút toán. */
  consistent: boolean;
  checkedAccounts: number;
  differences: ReconciliationRow[];
}
