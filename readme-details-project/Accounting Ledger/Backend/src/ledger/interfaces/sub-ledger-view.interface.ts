import type { PartyType } from '../../common/enums/party-type.enum.js';

/**
 * Read-model của **sổ cái phụ theo đối tượng** (mục 10.0).
 *
 * Đây là câu trả lời cho "ai đang nợ mình / mình đang nợ ai" mà lõi sổ cái trước
 * đây không có: công nợ chỉ nằm ở tài khoản tổng hợp 131/331 nên mọi khoản phải
 * thu của mọi khách hàng bị trộn vào nhau.
 *
 * Số liệu **tái lập từ `journal_lines`** (lọc theo `party_id`) chứ không đọc bảng
 * tổng hợp — cùng nguyên tắc với sổ cái tài khoản ở mục 6, nhờ vậy số dư công nợ
 * của từng đối tượng kiểm chứng được bằng truy vấn độc lập.
 */

/** Một dòng phát sinh của đối tượng, kèm số dư lũy kế sau dòng đó. */
export interface SubLedgerLine {
  journalEntryId: string;
  entryNo: string | null;
  date: string;
  description: string;
  reference: string | null;
  accountId: string;
  accountCode: string;
  accountName: string;
  lineDescription: string | null;
  debit: string;
  credit: string;
  /** Số dư lũy kế (thuần) sau dòng này — phần dư Nợ. */
  balanceDebit: string;
  /** Số dư lũy kế (thuần) sau dòng này — phần dư Có. */
  balanceCredit: string;
}

/** Sổ cái phụ của một đối tượng trong một khoảng ngày. */
export interface SubLedgerView {
  partyId: string;
  partyCode: string;
  partyName: string;
  partyType: PartyType;
  fromDate: string;
  toDate: string;
  periodId: string | null;
  periodCode: string | null;
  /** Mã các tài khoản công nợ đã phát sinh với đối tượng này (lọc hiển thị). */
  accountCodes: string[];
  openingDebit: string;
  openingCredit: string;
  lines: SubLedgerLine[];
  totalDebit: string;
  totalCredit: string;
  closingDebit: string;
  closingCredit: string;
  /**
   * Số dư thuần cuối kỳ (Nợ − Có): **dương** = đối tượng còn nợ mình,
   * **âm** = mình còn nợ đối tượng.
   */
  netClosing: string;
}
