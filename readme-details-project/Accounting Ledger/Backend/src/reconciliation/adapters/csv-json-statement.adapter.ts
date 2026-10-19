import { Injectable } from '@nestjs/common';

import { moneyToString, toMoney } from '../../common/utils/money.util.js';
import { isIsoDate } from '../../common/utils/date.util.js';
import { BankTransactionDirection } from '../enums/bank-transaction.enum.js';
import type {
  NormalizedBankTransaction,
  StatementSourceAdapter,
} from '../interfaces/statement-source-adapter.interface.js';

/**
 * Ánh xạ cột trong file ⇒ trường chuẩn hóa.
 *
 * Chấp nhận cả tên cột tiếng Việt lẫn tiếng Anh để người dùng không phải nhớ
 * đúng mẫu, nhưng **chỉ** ánh xạ tới những cột đã biết — cột lạ bị bỏ qua
 * (giữ lại trong `raw` để điều tra), thiếu cột bắt buộc thì báo lỗi.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  transactionDate: [
    'transaction_date',
    'transactiondate',
    'date',
    'ngay',
    'ngay_giao_dich',
    'ngay_gd',
  ],
  valueDate: ['value_date', 'valuedate', 'ngay_hieu_luc'],
  description: ['description', 'desc', 'mo_ta', 'dien_giai', 'noi_dung'],
  reference: ['reference', 'ref', 'ma_chung_tu', 'ma_ct'],
  bankRef: ['bank_ref', 'bankref', 'ma_giao_dich', 'magiaodich'],
  direction: ['direction', 'huong', 'chieu', 'chieu_tien', 'chi_hang', 'loai'],
  amount: ['amount', 'so_tien', 'sotien', 'gia_tri', 'value'],
  currency: ['currency', 'tien_te', 'tiente', 'loai_tien'],
};

/** Từ đồng nghĩa cho cột `direction`. */
const DIRECTION_IN = new Set(['in', 'inflow', 'receipt', 'credit', 'thu', 'vao']);
const DIRECTION_OUT = new Set([
  'out',
  'outflow',
  'payment',
  'debit',
  'chi',
  'ra',
]);

/**
 * **Adapter đọc file sao kê CSV/JSON** (mục 10.B — P2.2).
 *
 * Cùng một hàm `parse` xử lý cả hai định dạng: nếu nội dung là JSON hợp lệ
 * (mảng hoặc object) thì đọc theo JSON, ngược lại theo CSV có dòng tiêu đề.
 * Đây là **cách gọi khác nhau**, không phải **nhánh nghiệp vụ khác nhau** —
 * đầu ra luôn là danh sách `NormalizedBankTransaction[]` giống hệt nhau cho
 * cùng dữ liệu.
 *
 * Không đoán bừa: thiếu cột bắt buộc, ngày sai định dạng, số tiền không phải
 * số ⇒ ném lỗi kèm số dòng, để người nạp file biết chính xác chỗ nào sai.
 */
@Injectable()
export class CsvJsonStatementAdapter implements StatementSourceAdapter {
  readonly name = 'csv-json';

  parse(input: { content: string; accountId?: string }): NormalizedBankTransaction[] {
    const content = input.content?.trim();
    if (!content) {
      throw new Error('Nội dung sao kê trống');
    }

    const rows = this.looksLikeJson(content)
      ? this.readJsonRows(content)
      : this.readCsvRows(content);

    if (rows.length === 0) {
      throw new Error('Sao kê không có dòng dữ liệu nào');
    }

    return rows.map((row, index) => this.normalizeRow(row, index + 2));
  }

  // --------------------------------------------------------------- đọc

  private looksLikeJson(content: string): boolean {
    return content.startsWith('[') || content.startsWith('{');
  }

  private readJsonRows(content: string): Record<string, unknown>[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Sao kê JSON không hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Cả mảng dòng lẫn object bọc { "transactions": [...] } đều được chấp nhận.
    if (Array.isArray(parsed)) {
      return parsed.map((row, index) => this.asRecord(row, index + 1));
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
          return value.map((row, index) => this.asRecord(row, index + 1));
        }
      }
    }
    throw new Error('Sao kê JSON phải là mảng dòng hoặc object chứa một mảng');
  }

  private readCsvRows(content: string): Record<string, unknown>[] {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new Error('CSV phải có dòng tiêu đề và ít nhất một dòng dữ liệu');
    }

    const headers = this.splitCsvLine(lines[0]).map((header) =>
      this.canonicalKey(header),
    );

    return lines.slice(1).map((line, index) => {
      const cells = this.splitCsvLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((header, column) => {
        if (header) row[header] = cells[column] ?? '';
      });
      return this.asRecord(row, index + 2);
    });
  }

  /**
   * Tách một dòng CSV có hỗ trợ dấu phẩy trong ngoặc kép (`"a,b"`).
   * Không dùng `split(',')` thô vì mô tả giao dịch thường chứa phẩy.
   */
  private splitCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  // ------------------------------------------------------------ chuẩn hóa

  /**
   * Đưa một dòng thô về tên trường chuẩn.
   *
   * Hai việc quan trọng xảy ra ở đây:
   * - **Hướng tiền suy ra từ dấu của số tiền** khi file không khai cột hướng
   *   (số âm ⇒ `out`, số dương ⇒ `in`); số tiền luôn lưu **dương**.
   * - **Ngày phải là `YYYY-MM-DD` thật** (chặn `2026-02-31`).
   */
  private normalizeRow(
    row: Record<string, unknown>,
    lineNumber: number,
  ): NormalizedBankTransaction {
    const pick = (field: string): string | null => {
      for (const alias of COLUMN_ALIASES[field]) {
        const value = row[alias];
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
      }
      return null;
    };

    const transactionDate = pick('transactionDate');
    if (!transactionDate || !isIsoDate(transactionDate)) {
      throw new Error(
        `Dòng ${lineNumber}: transactionDate thiếu hoặc không phải YYYY-MM-DD hợp lệ`,
      );
    }

    const rawAmount = pick('amount');
    if (rawAmount === null) {
      throw new Error(`Dòng ${lineNumber}: thiếu cột amount`);
    }
    let amount: ReturnType<typeof toMoney>;
    try {
      amount = toMoney(rawAmount.replace(/,/g, ''));
    } catch {
      throw new Error(`Dòng ${lineNumber}: amount "${rawAmount}" không phải số`);
    }

    const direction = this.parseDirection(pick('direction'), amount, lineNumber);
    if (amount.isNegative()) {
      // Số âm là ký hiệu `out` của file — đã được `parseDirection` đọc, giờ
      // lưu số **dương** (chiều nằm riêng ở cột `direction`).
      amount = amount.abs();
    }

    const valueDate = pick('valueDate');
    if (valueDate && !isIsoDate(valueDate)) {
      throw new Error(
        `Dòng ${lineNumber}: valueDate "${valueDate}" không phải YYYY-MM-DD hợp lệ`,
      );
    }

    return {
      transactionDate,
      valueDate: valueDate ?? null,
      description: pick('description'),
      reference: pick('reference'),
      bankRef: pick('bankRef'),
      direction,
      amount: moneyToString(amount),
      currency: pick('currency')?.toUpperCase() ?? null,
      raw: { ...row },
    };
  }

  /**
   * Suy chiều tiền từ cột `direction` (nếu có), nếu không thì từ **dấu** của
   * số tiền. Không file nào khai cả hai thứ một cách mâu thuẫn được.
   */
  private parseDirection(
    value: string | null,
    amount: ReturnType<typeof toMoney>,
    lineNumber: number,
  ): BankTransactionDirection {
    const fromColumn = value ? this.directionFromColumn(value, lineNumber) : null;

    if (amount.isNegative()) {
      if (fromColumn === BankTransactionDirection.IN) {
        throw new Error(
          `Dòng ${lineNumber}: direction "in" nhưng số âm — mâu thuẫn, kiểm tra file`,
        );
      }
      return BankTransactionDirection.OUT;
    }

    if (amount.isZero()) {
      if (!fromColumn) {
        throw new Error(
          `Dòng ${lineNumber}: thiếu direction và số tiền bằng 0 — không suy ra được chiều`,
        );
      }
      return fromColumn;
    }

    if (fromColumn) return fromColumn;

    // Số dương, không khai hướng: **không đoán bừa** là `in`.
    throw new Error(
      `Dòng ${lineNumber}: thiếu cột direction và số tiền không có dấu — không tự đoán chiều tiền`,
    );
  }

  private directionFromColumn(
    value: string,
    lineNumber: number,
  ): BankTransactionDirection {
    const key = value.trim().toLowerCase();
    if (DIRECTION_IN.has(key)) return BankTransactionDirection.IN;
    if (DIRECTION_OUT.has(key)) return BankTransactionDirection.OUT;
    throw new Error(
      `Dòng ${lineNumber}: direction "${value}" không hợp lệ (dùng in/out, thu/chi, credit/debit)`,
    );
  }

  // ------------------------------------------------------------- tiện ích

  /**
   * Chuẩn hóa tên cột: bỏ dấu tiếng Việt, viết thường, gộp khoảng trắng/`-`
   * thành `_`. Bỏ dấu là bước bắt buộc để cột "Số tiền" khớp alias `so_tien`
   * — người dùng viết tên cột tiếng Việt không bị phạt.
   */
  private canonicalKey(key: string): string {
    return key
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }

  private asRecord(value: unknown, position: number): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Dòng ${position}: không phải bản ghi object`);
    }

    // Chuẩn hóa key của JSON y như key của CSV, để hai định dạng đi qua
    // đúng một đường chuẩn hóa.
    const normalized: Record<string, unknown> = {};
    for (const [key, cell] of Object.entries(value)) {
      normalized[this.canonicalKey(key)] = cell;
    }
    return normalized;
  }
}
