import type { BankTransactionDirection } from '../enums/bank-transaction.enum.js';

/**
 * Dòng sao kê **đã chuẩn hóa** — đầu ra của mọi adapter (mục 10.B — P2.2).
 *
 * Đây là hình dạng tối thiểu mà pipeline chung yêu cầu, bất kể dữ liệu đến từ
 * file CSV tải lên hay API ngân hàng. Parser **không** chứa logic khớp; logic
 * khớp **không** biết dữ liệu đến từ file hay API — đúng thiết kế "một
 * pipeline cho mọi nguồn".
 */
export interface NormalizedBankTransaction {
  /** Ngày giao dịch (YYYY-MM-DD). */
  transactionDate: string;
  /** Ngày có hiệu lực (YYYY-MM-DD) hoặc `null`. */
  valueDate: string | null;
  description: string | null;
  /** Tham chiếu trên sao kê. */
  reference: string | null;
  /** Mã giao dịch phía ngân hàng — chìa khóa khớp tầng 1. */
  bankRef: string | null;
  direction: BankTransactionDirection;
  /** Số tiền **luôn dương**; chiều nằm ở `direction`. */
  amount: string;
  currency: string | null;
  /** Payload gốc của dòng (để điều tra, không dùng để khớp). */
  raw: Record<string, unknown>;
}

/**
 * Nguồn dữ liệu sao kê.
 *
 * Hai hiện thực phải cho ra **cùng** `NormalizedBankTransaction[]` với cùng dữ
 * liệu nghiệp vụ — đó là tiêu chí kiểm thử bắt buộc (mục 8): thêm nguồn thứ ba
 * không cần viết nhánh code mới.
 */
export interface StatementSourceAdapter {
  readonly name: string;
  /**
   * Parse nội dung nguồn thành danh sách dòng đã chuẩn hóa.
   * Ném lỗi rõ ràng khi định dạng sai — **không** đoán bừa giá trị thiếu.
   */
  parse(input: { content: string; accountId?: string }): NormalizedBankTransaction[];
}
