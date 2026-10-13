/** Loại báo cáo tài chính (mục 7). */
export enum ReportKind {
  /** Kết quả kinh doanh (P&L). */
  PROFIT_AND_LOSS = 'profit-and-loss',
  /** Bảng cân đối kế toán. */
  BALANCE_SHEET = 'balance-sheet',
  /** Lưu chuyển tiền tệ (phương pháp trực tiếp). */
  CASH_FLOW = 'cash-flow',
}

export const ALL_REPORT_KINDS: readonly ReportKind[] = Object.values(ReportKind);

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  [ReportKind.PROFIT_AND_LOSS]: 'Kết quả kinh doanh',
  [ReportKind.BALANCE_SHEET]: 'Bảng cân đối kế toán',
  [ReportKind.CASH_FLOW]: 'Lưu chuyển tiền tệ',
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
