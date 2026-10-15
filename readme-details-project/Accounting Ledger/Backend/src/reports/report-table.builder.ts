import { ReportKind, REPORT_KIND_LABELS } from './enums/report.enum.js';
import type { ReportTable, ReportTableColumn } from './interfaces/report-table.interface.js';
import type {
  BalanceSheetView,
  CashFlowView,
  ProfitAndLossView,
  ReportAccountLine,
  ReportSection,
} from './interfaces/report-view.interface.js';
import type { VatDocumentRow, VatView } from './interfaces/vat-view.interface.js';
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

/**
 * Cột của bảng kê thuế GTGT — **khác** ba báo cáo tài chính: ở đây mỗi dòng là một hóa
 * đơn chứ không phải một tài khoản, nên phải có số/ngày hóa đơn và mã số thuế đối tượng
 * để tra ngược chứng từ giấy.
 */
const VAT_COLUMNS: ReportTableColumn[] = [
  { header: 'Số hóa đơn', width: 16 },
  { header: 'Ngày', width: 12 },
  { header: 'Đối tượng', width: 28 },
  { header: 'Mã số thuế', width: 16 },
  { header: 'Tiền chưa thuế', align: 'right', width: 18 },
  { header: 'Thuế GTGT', align: 'right', width: 16 },
  { header: 'Tổng thanh toán', align: 'right', width: 18 },
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

/** Bảng kê thuế GTGT đầu vào / đầu ra (mục 10.C.2). */
function vatTable(view: VatView): ReportTable {
  const period = view.periodCode
    ? `Kỳ ${view.periodCode}`
    : `${formatDateDisplay(view.fromDate)} → ${formatDateDisplay(view.toDate)}`;

  const vatRow = (row: VatDocumentRow): string[] => [
    row.documentNo,
    formatDateDisplay(row.date),
    row.partyName,
    row.partyTaxCode ?? '—',
    formatMoneyDisplay(row.subtotal),
    formatMoneyDisplay(row.taxAmount),
    formatMoneyDisplay(row.total),
  ];

  const sectionRows = (label: string, section: VatView['output']): string[][] => [
    ['', label, '', '', '', '', ''],
    ...section.documents.map(vatRow),
    [
      '',
      `Tổng ${label.toLowerCase()}`,
      '',
      '',
      formatMoneyDisplay(section.subtotal),
      formatMoneyDisplay(section.taxAmount),
      formatMoneyDisplay(section.total),
    ],
  ];

  return {
    title: REPORT_KIND_LABELS[ReportKind.VAT_INPUT_OUTPUT],
    subtitle: `${period} · Lập ngày ${formatDateDisplay(view.toDate)}`,
    columns: VAT_COLUMNS,
    rows: [
      ...sectionRows('Hóa đơn đầu ra', view.output),
      ...sectionRows('Hóa đơn đầu vào', view.input),
    ],
    footers: [
      ['', 'Tổng thuế GTGT đầu ra', '', '', '', formatMoneyDisplay(view.output.taxAmount), ''],
      ['', 'Tổng thuế GTGT đầu vào', '', '', '', formatMoneyDisplay(view.input.taxAmount), ''],
      ['', 'Thuế GTGT phải nộp', '', '', '', formatMoneyDisplay(view.payable), ''],
    ],
    notes: [
      'Đơn vị tính: VND',
      'Chỉ tổng hợp chứng từ đã ghi sổ (trạng thái "posted"); chứng từ đã hủy không được tính.',
      'Thuế GTGT phải nộp = đầu ra − đầu vào; số âm nghĩa là còn được khấu trừ.',
    ],
  };
}

/** Quy một báo cáo về cấu trúc bảng trung lập để xuất file. */
export function buildReportTable(
  kind: ReportKind,
  view: ProfitAndLossView | BalanceSheetView | CashFlowView | VatView,
): ReportTable {
  switch (kind) {
    case ReportKind.PROFIT_AND_LOSS:
      return profitAndLossTable(view as ProfitAndLossView);
    case ReportKind.BALANCE_SHEET:
      return balanceSheetTable(view as BalanceSheetView);
    case ReportKind.CASH_FLOW:
      return cashFlowTable(view as CashFlowView);
    case ReportKind.VAT_INPUT_OUTPUT:
      return vatTable(view as VatView);
  }
}
