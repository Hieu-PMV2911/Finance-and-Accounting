/**
 * Mô hình **giao dịch ngân hàng chuẩn hóa** (mục 10.B, quyết định #4).
 *
 * Quyết định đã chốt: *"chuẩn hóa dữ liệu sao kê thành một mô hình giao dịch ngân
 * hàng thống nhất. CSV/JSON và kết nối ngân hàng đều đưa dữ liệu vào cùng một
 * pipeline xử lý."*
 *
 * Hệ quả: các enum dưới đây mô tả **giao dịch**, không mô tả **nguồn**. Nhờ vậy
 * parser (`StatementSourceAdapter`) chỉ lo đọc/chuẩn hóa, còn logic khớp đối soát
 * **không biết** dữ liệu đến từ file hay từ API ngân hàng.
 */

/** Chiều tiền của một dòng sao kê. */
export enum BankTransactionDirection {
  /** Tiền vào tài khoản (ghi Nợ tài khoản tiền). */
  IN = 'in',
  /** Tiền ra khỏi tài khoản (ghi Có tài khoản tiền). */
  OUT = 'out',
}

export const ALL_BANK_TRANSACTION_DIRECTIONS: readonly BankTransactionDirection[] =
  Object.values(BankTransactionDirection);

export const BANK_TRANSACTION_DIRECTION_LABELS: Record<
  BankTransactionDirection,
  string
> = {
  [BankTransactionDirection.IN]: 'Tiền vào',
  [BankTransactionDirection.OUT]: 'Tiền ra',
};

/**
 * Nguồn dữ liệu của dòng giao dịch.
 *
 * Chỉ dùng để **truy vết** (biết dòng này đến từ file nào / kết nối nào), không
 * dùng để rẽ nhánh xử lý — mọi dòng đều đi qua cùng một pipeline.
 */
export enum BankTransactionSource {
  /** Nhập từ file CSV/JSON. */
  FILE = 'file',
  /** Lấy qua kết nối API ngân hàng (khung, chưa hiện thực). */
  API = 'api',
}

export const ALL_BANK_TRANSACTION_SOURCES: readonly BankTransactionSource[] =
  Object.values(BankTransactionSource);

export const BANK_TRANSACTION_SOURCE_LABELS: Record<BankTransactionSource, string> = {
  [BankTransactionSource.FILE]: 'Nhập từ file',
  [BankTransactionSource.API]: 'Kết nối ngân hàng',
};

/**
 * Kết quả khớp của một dòng sao kê với chứng từ nội bộ.
 *
 * - `matched`   : đã khớp và được xác nhận (khớp tầng 1, hoặc người dùng xác nhận).
 * - `suggested` : có **gợi ý** khớp nhưng chưa chắc chắn (khớp tầng 2/3) — cần người xác nhận.
 * - `unmatched` : chưa tìm được chứng từ nội bộ nào.
 */
export enum BankMatchStatus {
  MATCHED = 'matched',
  SUGGESTED = 'suggested',
  UNMATCHED = 'unmatched',
}

export const ALL_BANK_MATCH_STATUSES: readonly BankMatchStatus[] =
  Object.values(BankMatchStatus);

export const BANK_MATCH_STATUS_LABELS: Record<BankMatchStatus, string> = {
  [BankMatchStatus.MATCHED]: 'Đã khớp',
  [BankMatchStatus.SUGGESTED]: 'Có gợi ý',
  [BankMatchStatus.UNMATCHED]: 'Chưa khớp',
};

/** Trạng thái một bảng sao kê đã nhập. */
export enum BankStatementStatus {
  /** Đang xử lý/đối soát — còn có thể khớp thêm. */
  DRAFT = 'draft',
  /** Đã chốt đối soát — **bất biến**, không nhận dòng mới, không sửa khớp. */
  RECONCILED = 'reconciled',
}

export const ALL_BANK_STATEMENT_STATUSES: readonly BankStatementStatus[] =
  Object.values(BankStatementStatus);

export const BANK_STATEMENT_STATUS_LABELS: Record<BankStatementStatus, string> = {
  [BankStatementStatus.DRAFT]: 'Đang đối soát',
  [BankStatementStatus.RECONCILED]: 'Đã chốt',
};
