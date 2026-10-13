import { existsSync } from 'node:fs';

import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import type { ExportReportDto } from './dto/export-report.dto.js';
import {
  ReportFormat,
  REPORT_FORMAT_MIME,
  ReportKind,
} from './enums/report.enum.js';
import type { ReportTable } from './interfaces/report-table.interface.js';
import { buildReportTable } from './report-table.builder.js';
import { ReportsService } from './reports.service.js';

/** Kết quả xuất file: nội dung nhị phân + tên file gợi ý. */
export interface ExportedReport {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Font TrueType dùng để nhúng vào PDF.
 *
 * PDF chỉ có sẵn các font base-14 (Helvetica…) theo bảng mã WinAnsi — **không có
 * dấu tiếng Việt**. Muốn xuất PDF đúng tiếng Việt buộc phải nhúng một font
 * Unicode; ở đây lấy font hệ thống, có thể ghi đè bằng `PDF_FONT_PATH`.
 */
const REGULAR_FONT_CANDIDATES: readonly string[] = [
  process.env.PDF_FONT_PATH ?? '',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/tahoma.ttf',
  'C:/Windows/Fonts/times.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

const BOLD_FONT_CANDIDATES: readonly string[] = [
  process.env.PDF_FONT_BOLD_PATH ?? '',
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/timesbd.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

function firstExisting(candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Excel giới hạn tên sheet 31 ký tự và cấm `[]:*?/\\`. */
function sanitizeSheetName(name: string): string {
  return (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Report').slice(0, 31);
}

@Injectable()
export class ReportExportService {
  constructor(private readonly reports: ReportsService) {}

  /** Dựng báo cáo rồi kết xuất ra `xlsx` hoặc `pdf`. */
  async export(kind: ReportKind, query: ExportReportDto): Promise<ExportedReport> {
    const table = buildReportTable(kind, await this.buildView(kind, query));
    const buffer =
      query.format === ReportFormat.PDF
        ? await this.renderPdf(table)
        : await this.renderXlsx(table);

    const period = table.subtitle.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');

    return {
      buffer,
      filename: `${kind}-${period || 'report'}.${query.format}`,
      contentType: REPORT_FORMAT_MIME[query.format],
    };
  }

  private buildView(kind: ReportKind, query: ExportReportDto) {
    switch (kind) {
      case ReportKind.PROFIT_AND_LOSS:
        return this.reports.profitAndLoss(query);
      case ReportKind.BALANCE_SHEET:
        return this.reports.balanceSheet(query);
      case ReportKind.CASH_FLOW:
        return this.reports.cashFlow(query);
    }
  }

  // ------------------------------------------------------------- Excel

  private async renderXlsx(table: ReportTable): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Accounting Ledger';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sanitizeSheetName(table.title));
    const columnCount = table.columns.length;

    sheet.mergeCells(1, 1, 1, columnCount);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = table.title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, columnCount);
    const subtitleCell = sheet.getCell(2, 1);
    subtitleCell.value = table.subtitle;
    subtitleCell.font = { italic: true, size: 10 };
    subtitleCell.alignment = { horizontal: 'center' };

    sheet.addRow([]);

    const headerRow = sheet.addRow(table.columns.map((column) => column.header));
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' },
      };
      cell.border = { bottom: { style: 'thin' } };
    });

    const amountColumn = table.columns.length;
    for (const row of table.rows) {
      const added = sheet.addRow(row);
      const amountCell = added.getCell(amountColumn);
      amountCell.alignment = { horizontal: 'right' };
    }

    for (const footer of table.footers) {
      const added = sheet.addRow(footer);
      added.font = { bold: true };
      added.getCell(amountColumn).alignment = { horizontal: 'right' };
    }

    sheet.addRow([]);
    for (const note of table.notes) {
      const added = sheet.addRow([note]);
      added.font = { italic: true, size: 9 };
    }

    table.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width ?? 16;
    });

    const out = await workbook.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  // --------------------------------------------------------------- PDF

  private async renderPdf(table: ReportTable): Promise<Buffer> {
    const regularFont = firstExisting(REGULAR_FONT_CANDIDATES);
    const boldFont = firstExisting(BOLD_FONT_CANDIDATES) ?? regularFont;

    const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });

    if (regularFont) {
      doc.registerFont('body', regularFont);
      doc.registerFont('body-bold', boldFont ?? regularFont);
      doc.font('body');
    }

    const body = regularFont ? 'body' : 'Helvetica';
    const strong = boldFont ? 'body-bold' : regularFont ? 'body' : 'Helvetica-Bold';

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - left - doc.page.margins.right;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 12;

    const totalWeight = table.columns.reduce(
      (sum, column) => sum + (column.width ?? 16),
      0,
    );
    const widths = table.columns.map(
      (column) => ((column.width ?? 16) / totalWeight) * contentWidth,
    );
    const xs: number[] = [];
    let cursor = left;
    for (const width of widths) {
      xs.push(cursor);
      cursor += width;
    }

    doc.font(strong).fontSize(15);
    doc.text(table.title, left, doc.y, { width: contentWidth, align: 'center' });
    doc.font(body).fontSize(9);
    doc.text(table.subtitle, left, doc.y + 2, { width: contentWidth, align: 'center' });
    doc.moveDown(1);

    let y = doc.y;

    const drawRow = (
      cells: readonly string[],
      options: { bold?: boolean; size?: number; rule?: boolean } = {},
    ): void => {
      const size = options.size ?? 9;
      doc.font(options.bold ? strong : body).fontSize(size);

      const heights = cells.map((text, index) =>
        doc.heightOfString(text ?? '', {
          width: widths[index] - 6,
          align: table.columns[index]?.align ?? 'left',
        }),
      );
      const rowHeight = Math.max(...heights, size + 2) + 5;

      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      cells.forEach((text, index) => {
        doc.text(text ?? '', xs[index] + 3, y + 2, {
          width: widths[index] - 6,
          align: table.columns[index]?.align ?? 'left',
        });
      });

      if (options.rule) {
        doc
          .moveTo(left, y + rowHeight - 1)
          .lineTo(left + contentWidth, y + rowHeight - 1)
          .lineWidth(0.5)
          .strokeColor('#888888')
          .stroke();
      }

      y += rowHeight;
    };

    drawRow(
      table.columns.map((column) => column.header),
      { bold: true, rule: true },
    );

    for (const row of table.rows) {
      drawRow(row);
    }

    if (table.footers.length > 0) {
      y += 4;
      for (const footer of table.footers) {
        drawRow(footer, { bold: true });
      }
    }

    if (table.notes.length > 0) {
      y += 12;
      for (const note of table.notes) {
        drawRow([note], { size: 8 });
      }
    }

    // Số trang — chèn sau khi đã biết tổng số trang.
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.page.margins.bottom = 0;
      doc.font(body).fontSize(8);
      doc.text(
        `Trang ${index + 1}/${range.count}`,
        left,
        doc.page.height - 28,
        { width: contentWidth, align: 'right' },
      );
    }

    doc.end();
    return finished;
  }
}
