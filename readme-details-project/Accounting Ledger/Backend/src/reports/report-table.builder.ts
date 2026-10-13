import { ReportKind, REPORT_KIND_LABELS } from './enums/report.enum.js';
import type { ReportTable, ReportTableColumn } from './interfaces/report-table.interface.js';
import type {
  BalanceSheetView,
  CashFlowView,
  ProfitAndLossView,
  ReportAccountLine,
  ReportSection,
} from './interfaces/report-view.interface.js';
import {
  formatDateDisplay,
  formatMoneyDisplay,
  formatPercentDisplay,
} from './report-format.util.js';

const COLUMNS: ReportTableColumn[] = [
  { header: 'Mã TK', width: 12 },
  { header: 'Chỉ tiêu', width: 52 },
  { header: 'Số tiền', align: 'right', width: 22 },
];

const NOTES = [
  'Đơn vị tính: VND',
  'Chỉ tổng hợp bút toán đã ghi sổ (trạng thái "posted" / "reversed").',
];

/** Dòng tiêu đề nhóm (không có số tiền). */
function sectionHeader(label: string): string[] {
  return ['', label, ''];
}

function lineRow(line: ReportAccountLine): string[] {
  return [line.accountCode, line.accountName, formatMoneyDisplay(line.amount)];
}

function sectionRows(label: string, section: ReportSection): string[][] {
  return [
    sectionHeader(label),
    ...section.lines.map(lineRow),
    ['', `Tổng ${label.toLowerCase()}`, formatMoneyDisplay(section.total)],
  ];
}

/** Bảng báo cáo kết quả kinh doanh. */
function profitAndLossTable(view: ProfitAndLossView): ReportTable {
  const period = view.periodCode
    ? `Kỳ ${view.periodCode}`
    : `${formatDateDisplay(view.fromDate)} → ${formatDateDisplay(view.toDate)}`;

  return {
    title: REPORT_KIND_LABELS[ReportKind.PROFIT_AND_LOSS],
    subtitle: `${period} · Lập ngày ${formatDateDisplay(view.toDate)}`,
    columns: COLUMNS,
    rows: [
      ...sectionRows('Doanh thu', view.revenue),
      ...sectionRows('Chi phí', view.expense),
    ],
    footers: [
      ['', 'Lợi nhuận thuần', formatMoneyDisplay(view.netProfit)],
      ['', 'Tỷ suất lợi nhuận/doanh thu', formatPercentDisplay(view.netProfitMargin)],
    ],
    notes: NOTES,
  };
}

/** Bảng cân đối kế toán. */
function balanceSheetTable(view: BalanceSheetView): ReportTable {
  const period = view.periodCode
    ? `Kỳ ${view.periodCode}`
    : `Đến ngày ${formatDateDisplay(view.asOfDate)}`;

  return {
    title: REPORT_KIND_LABELS[ReportKind.BALANCE_SHEET],
    subtitle: `${period} · Lập ngày ${formatDateDisplay(view.asOfDate)}`,
    columns: COLUMNS,
    rows: [
      ...sectionRows('Tài sản', view.assets),
      ...sectionRows('Nợ phải trả', view.liabilities),
      ...sectionRows('Vốn chủ sở hữu', view.equity),
      sectionHeader('Lợi nhuận chưa phân phối'),
      ['', 'Lợi nhuận lũy kế chưa phân phối', formatMoneyDisplay(view.retainedEarnings)],
    ],
    footers: [
      ['', 'Tổng tài sản', formatMoneyDisplay(view.totalAssets)],
      ['', 'Tổng nguồn vốn', formatMoneyDisplay(view.totalLiabilitiesAndEquity)],
      ['', 'Cân đối', view.balanced ? 'Đạt' : 'Lệch'],
    ],
    notes: NOTES,
  };
}

/** Bảng lưu chuyển tiền tệ. */
function cashFlowTable(view: CashFlowView): ReportTable {
  const period = view.periodCode
    ? `Kỳ ${view.periodCode}`
    : `${formatDateDisplay(view.fromDate)} → ${formatDateDisplay(view.toDate)}`;

  const rows: string[][] = [
    sectionHeader('Số dư tiền đầu kỳ'),
    ['', 'Tiền và tương đương tiền đầu kỳ', formatMoneyDisplay(view.openingCash)],
  ];

  for (const group of view.groups) {
    rows.push(sectionHeader(group.label));
    for (const item of group.items) {
      rows.push([item.accountCode, item.accountName, formatMoneyDisplay(item.amount)]);
    }
    rows.push([
      '',
      `Lưu chuyển thuần — ${group.label.toLowerCase()}`,
      formatMoneyDisplay(group.net),
    ]);
  }

  return {
    title: REPORT_KIND_LABELS[ReportKind.CASH_FLOW],
    subtitle: `${period} · Lập ngày ${formatDateDisplay(view.toDate)}`,
    columns: COLUMNS,
    rows,
    footers: [
      ['', 'Lưu chuyển tiền thuần trong kỳ', formatMoneyDisplay(view.netChange)],
      ['', 'Tiền và tương đương tiền cuối kỳ', formatMoneyDisplay(view.closingCash)],
    ],
    notes: [
      ...NOTES,
      'Phân loại dòng tiền theo mã tài khoản đối ứng (phương pháp trực tiếp).',
    ],
  };
}

/** Quy một báo cáo về cấu trúc bảng trung lập để xuất file. */
export function buildReportTable(
  kind: ReportKind,
  view: ProfitAndLossView | BalanceSheetView | CashFlowView,
): ReportTable {
  switch (kind) {
    case ReportKind.PROFIT_AND_LOSS:
      return profitAndLossTable(view as ProfitAndLossView);
    case ReportKind.BALANCE_SHEET:
      return balanceSheetTable(view as BalanceSheetView);
    case ReportKind.CASH_FLOW:
      return cashFlowTable(view as CashFlowView);
  }
}
