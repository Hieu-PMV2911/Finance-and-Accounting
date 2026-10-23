/** Loại báo cáo tài chính (mục 7). */
export enum ReportKind {
  /** Kết quả kinh doanh (P&L). */
  PROFIT_AND_LOSS = 'profit-and-loss',
  /** Bảng cân đối kế toán. */
  BALANCE_SHEET = 'balance-sheet',
  /** Lưu chuyển tiền tệ (phương pháp trực tiếp). */
  CASH_FLOW = 'cash-flow',
  /**
   * Bảng kê thuế GTGT đầu vào / đầu ra (mục 10.C.2).
   *
   * Khác ba báo cáo trên ở **đơn vị tổng hợp**: chúng gộp theo tài khoản, còn bảng kê
   * thuế giữ từng hóa đơn (số, ngày, mã số thuế đối tượng) để tra ngược chứng từ giấy.
   */
  VAT_INPUT_OUTPUT = 'vat-input-output',
}

export const ALL_REPORT_KINDS: readonly ReportKind[] = Object.values(ReportKind);

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  [ReportKind.PROFIT_AND_LOSS]: 'Kết quả kinh doanh',
  [ReportKind.BALANCE_SHEET]: 'Bảng cân đối kế toán',
  [ReportKind.CASH_FLOW]: 'Lưu chuyển tiền tệ',
  [ReportKind.VAT_INPUT_OUTPUT]: 'Bảng kê thuế GTGT đầu vào - đầu ra',
};

/** Định dạng xuất báo cáo. */
export enum ReportFormat {
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export const ALL_REPORT_FORMATS: readonly ReportFormat[] = Object.values(ReportFormat);

/** Kiểu nội dung + đuôi file tương ứng. */
export const REPORT_FORMAT_MIME: Record<ReportFormat, string> = {
  [ReportFormat.XLSX]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [ReportFormat.PDF]: 'application/pdf',
};
