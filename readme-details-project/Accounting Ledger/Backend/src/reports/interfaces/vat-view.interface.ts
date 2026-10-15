/**
 * Báo cáo thuế GTGT đầu vào / đầu ra (mục 10.C.2).
 *
 * Đây là dạng **bảng kê hóa đơn** — mỗi dòng là một chứng từ đã ghi sổ, kèm mã số thuế
 * của đối tượng để đối chiếu với tờ khai. Cố ý khác các báo cáo tài chính ở chỗ: chúng
 * gộp theo **tài khoản**, còn bảng kê thuế phải giữ được **từng hóa đơn** thì mới tra
 * ngược ra chứng từ giấy được.
 */

/** Một hóa đơn trên bảng kê thuế. */
export interface VatDocumentRow {
  documentId: string;
  documentNo: string;
  date: string;
  partyId: string;
  partyCode: string;
  partyName: string;
  /** Mã số thuế của đối tượng — `null` khi chưa khai (hóa đơn bán lẻ). */
  partyTaxCode: string | null;
  /** Doanh thu/chi phí chưa thuế (tổng các dòng). */
  subtotal: string;
  /** Tiền thuế GTGT của chứng từ (tổng thuế các dòng đã làm tròn). */
  taxAmount: string;
  /** Tổng thanh toán = `subtotal + taxAmount`. */
  total: string;
}

/** Một chiều của bảng kê (đầu ra hoặc đầu vào). */
export interface VatSection {
  documents: VatDocumentRow[];
  subtotal: string;
  taxAmount: string;
  total: string;
}

/** Báo cáo thuế GTGT trong một kỳ/khoảng ngày. */
export interface VatView {
  fromDate: string;
  toDate: string;
  periodId: string | null;
  periodCode: string | null;
  /** Đầu ra — hóa đơn bán đã ghi sổ. */
  output: VatSection;
  /** Đầu vào — hóa đơn mua đã ghi sổ. */
  input: VatSection;
  /**
   * Thuế GTGT phải nộp = `output.taxAmount − input.taxAmount`.
   * **Âm** nghĩa là còn được khấu trừ (chuyển kỳ sau), không phải số âm phải nộp.
   */
  payable: string;
  /** Số chứng từ được tổng hợp mỗi chiều — để biết bảng kê có rỗng hay không. */
  documentCounts: { output: number; input: number };
}
