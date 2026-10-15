import type {
  BankTransactionDirection,
  BankTransactionSource,
} from '../../common/enums/bank-transaction.enum.js';

/**
 * Một dòng sao kê **đã chuẩn hóa** (mục 10.B).
 *
 * Đây là *ranh giới* của pipeline: mọi adapter (file CSV/JSON hôm nay, API ngân
 * hàng sau này) đều phải trả về đúng kiểu này. Nhờ vậy phần khớp đối soát chỉ
 * biết một mô hình dữ liệu duy nhất và **không có nhánh code theo nguồn**.
 */
export interface NormalizedBankTransaction {
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  valueDate: string | null;
  description: string | null;
  reference: string | null;
  bankRef: string | null;
  direction: BankTransactionDirection;
  /** Chuỗi tiền (4 số thập phân), luôn **dương** — chiều nằm ở `direction`. */
  amount: string;
  currency: string;
  /** Dòng gốc trong file, giữ nguyên để đối chiếu khi parser sai. */
  raw: Record<string, unknown> | null;
}

export interface StatementParseInput {
  /** Nội dung thô (CSV hoặc JSON). */
  content: string;
  /** Đồng tiền mặc định khi dòng không khai (mặc định `VND`). */
  currency?: string;
  /** Id file/kết nối nguồn — ghi vào `source_ref` để truy vết. */
  sourceRef?: string | null;
}

/**
 * Hợp đồng của một **nguồn sao kê** (quyết định #4).
 *
 * Adapter **chỉ** đọc và chuẩn hóa. Nó **không** biết gì về khớp đối soát, không
 * chạm DB, không quyết định dòng nào khớp dòng nào — nhờ vậy thêm nguồn mới
 * (API ngân hàng) không thể vô tình tạo ra nhánh xử lý thứ hai.
 */
export interface StatementSourceAdapter {
  readonly source: BankTransactionSource;
  readonly name: string;
  /** Có xử lý được nội dung này không (theo định dạng). */
  supports(content: string): boolean;
  parse(input: StatementParseInput): NormalizedBankTransaction[];
}
