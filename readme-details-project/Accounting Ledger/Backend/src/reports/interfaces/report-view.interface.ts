/** Một dòng tài khoản trên báo cáo (số tiền đã theo đúng chiều trình bày). */
export interface ReportAccountLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  /** Số tiền dương = tăng theo chiều của báo cáo (vd doanh thu = Có − Nợ). */
  amount: string;
}

/** Một nhóm chỉ tiêu (các dòng + tổng nhóm). */
export interface ReportSection {
  lines: ReportAccountLine[];
  total: string;
}

/** Báo cáo kết quả kinh doanh. */
export interface ProfitAndLossView {
  fromDate: string;
  toDate: string;
  periodId: string | null;
  periodCode: string | null;
  revenue: ReportSection;
  expense: ReportSection;
  /** Lợi nhuận thuần = tổng doanh thu − tổng chi phí. */
  netProfit: string;
  /** Tỷ suất lợi nhuận trên doanh thu (%), `null` khi kỳ không có doanh thu. */
  netProfitMargin: string | null;
}

/** Bảng cân đối kế toán tại một thời điểm (`asOfDate`). */
export interface BalanceSheetView {
  asOfDate: string;
  periodId: string | null;
  periodCode: string | null;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  /** Lợi nhuận lũy kế chưa phân phối (doanh thu − chi phí lũy kế) — thuộc vốn. */
  retainedEarnings: string;
  totalAssets: string;
  totalLiabilitiesAndEquity: string;
  /** `true` ⇒ Tài sản = Nợ phải trả + Vốn chủ sở hữu. */
  balanced: boolean;
}

export type CashFlowGroupKey = 'operating' | 'investing' | 'financing';

export interface CashFlowItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
}

export interface CashFlowGroup {
  key: CashFlowGroupKey;
  label: string;
  /** Tổng dòng tiền vào (dương). */
  inflow: string;
  /** Tổng dòng tiền ra (giá trị tuyệt đối). */
  outflow: string;
  /** Chênh lệch thuần của nhóm. */
  net: string;
  items: CashFlowItem[];
}

/** Báo cáo lưu chuyển tiền tệ (phương pháp trực tiếp). */
export interface CashFlowView {
  fromDate: string;
  toDate: string;
  periodId: string | null;
  periodCode: string | null;
  openingCash: string;
  netChange: string;
  closingCash: string;
  groups: CashFlowGroup[];
}
