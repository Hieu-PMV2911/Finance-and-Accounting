import { BadRequestException, Injectable } from '@nestjs/common';

import {
  BankTransactionDirection,
  BankTransactionSource,
} from '../../common/enums/bank-transaction.enum.js';
import { isIsoDate } from '../../common/utils/date.util.js';
import { MONEY_PATTERN, moneyToString, toMoney } from '../../common/utils/money.util.js';
import type {
  NormalizedBankTransaction,
  StatementParseInput,
  StatementSourceAdapter,
} from '../interfaces/statement-source-adapter.interface.js';

/** Tên cột được nhận diện (không phân biệt hoa/thường, đã bỏ dấu cách và dấu gạch). */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  transactionDate: ['transactiondate', 'date', 'ngay', 'ngaygiaodich', 'ngayhachtoan'],
  valueDate: ['valuedate', 'ngayhieuluc', 'ngaygiattri'],
  description: ['description', 'memo', 'dien giai', 'diengiai', 'noidung', 'noi dung', 'remark'],
  reference: ['reference', 'ref', 'sothamchieu', 'so tham chieu', 'chungtu'],
  bankRef: [
    'bankref',
    'bank ref',
    'magiaodich',
    'ma giao dich',
    'transactionid',
    'transaction id',
    'ft',
    'sobuttoan',
  ],
  direction: ['direction', 'chieu', 'loai', 'type'],
  amount: ['amount', 'sotien', 'so tien', 'giatri', 'sotiengiaodich'],
  credit: ['credit', 'co', 'phatsinhco', 'tienvao', 'ghi co'],
  debit: ['debit', 'no', 'phatsinhno', 'tienra', 'ghi no'],
  currency: ['currency', 'loaitien', 'loai tien', 'tiente'],
};

const DIRECTION_IN = new Set(['in', 'credit', 'co', 'c', 'thu', 'tienvao', '+']);
const DIRECTION_OUT = new Set(['out', 'debit', 'no', 'n', 'chi', 'tienra', '-']);

/**
 * Adapter đọc sao kê từ **file CSV/JSON** (mục 10.B) — hiện thực chính.
 *
 * Vì sao tự viết parser thay vì dùng thư viện: yêu cầu chỉ là CSV/JSON phẳng với
 * tên cột do ngân hàng tự đặt, mà tên cột **khác nhau từng ngân hàng**. Phần khó
 * thật sự là *nhận diện cột*, không phải tách dấu phẩy — nên logic nằm ở bảng
 * `COLUMN_ALIASES` và ở quy tắc suy ra chiều tiền, không ở thư viện.
 *
 * Quy tắc suy ra chiều tiền (theo thứ tự ưu tiên, dừng ở cái đầu tiên dùng được):
 * 1. Cột `direction` khai tường minh.
 * 2. Cặp cột `credit` (tiền vào) / `debit` (tiền ra).
 * 3. Dấu của `amount`: âm ⇒ tiền ra, dương ⇒ tiền vào.
 *
 * Số tiền luôn được chuẩn hóa về **dương** và lưu 4 số thập phân; chiều nằm ở
 * `direction` — đúng mô hình chuẩn của `bank_transactions`.
 */
@Injectable()
export class CsvJsonStatementAdapter implements StatementSourceAdapter {
  readonly source = BankTransactionSource.FILE;
  readonly name = 'csv-json';

  supports(content: string): boolean {
    const trimmed = content.trim();
    if (trimmed === '') return false;
    // JSON (mảng/đối tượng) hoặc CSV có ít nhất một dấu phân cách.
    return (
      trimmed.startsWith('[') ||
      trimmed.startsWith('{') ||
      trimmed.includes(',') ||
      trimmed.includes(';') ||
      trimmed.includes('\t')
    );
  }

  parse(input: StatementParseInput): NormalizedBankTransaction[] {
    const trimmed = input.content.trim();
    if (trimmed === '') {
      throw new BadRequestException('Nội dung sao kê rỗng');
    }

    const defaultCurrency = (input.currency ?? 'VND').trim().toUpperCase();
    const rows = trimmed.startsWith('[') || trimmed.startsWith('{')
      ? this.parseJson(trimmed)
      : this.parseCsv(trimmed);

    if (rows.length === 0) {
      throw new BadRequestException('Không đọc được dòng sao kê nào từ nội dung đã nhập');
    }

    const normalized = rows.map((row) => this.normalizeRow(row, defaultCurrency));

    // Chống trùng **trong cùng một file**: cùng ngày + mã giao dịch + số tiền ⇒ một dòng.
    const seen = new Set<string>();
    return normalized.filter((line) => {
      const key = [
        line.transactionDate,
        line.bankRef ?? '',
        line.amount,
        line.direction,
      ].join('|');
      if (line.bankRef && seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ------------------------------------------------------------- đọc thô

  private parseJson(content: string): Record<string, unknown>[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new BadRequestException('Nội dung JSON của sao kê không hợp lệ');
    }

    const list = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.transactions)
        ? (parsed.transactions as unknown[])
        : null;

    if (!list) {
      throw new BadRequestException(
        'JSON sao kê phải là mảng dòng giao dịch (hoặc đối tượng có trường "transactions")',
      );
    }

    return list.filter(isRecord);
  }

  private parseCsv(content: string): Record<string, unknown>[] {
    const lines = this.splitCsvLines(content);
    if (lines.length < 2) {
      throw new BadRequestException('File CSV sao kê phải có dòng tiêu đề và ít nhất một dòng dữ liệu');
    }

    const header = lines[0].map((cell) => this.canonical(cell));
    return lines.slice(1).map((cells) => {
      const row: Record<string, unknown> = {};
      header.forEach((key, index) => {
        row[key] = cells[index] ?? '';
      });
      return row;
    });
  }

  /** Tách CSV có xử lý ô được bao trong dấu nháy kép. */
  private splitCsvLines(content: string): string[][] {
    const delimiter = this.detectDelimiter(content);
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];

      if (inQuotes) {
        if (char === '"') {
          if (content[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && content[index + 1] === '\n') index += 1;
        row.push(field);
        field = '';
        if (row.some((cell) => cell.trim() !== '')) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    return rows;
  }

  private detectDelimiter(content: string): string {
    const firstLine = content.split(/\r?\n/)[0] ?? '';
    const candidates = [',', ';', '\t'];
    let best = ',';
    let bestCount = -1;
    for (const candidate of candidates) {
      const count = firstLine.split(candidate).length;
      if (count > bestCount) {
        bestCount = count;
        best = candidate;
      }
    }
    return best;
  }

  // ---------------------------------------------------------- chuẩn hóa

  private normalizeRow(
    row: Record<string, unknown>,
    defaultCurrency: string,
  ): NormalizedBankTransaction {
    const raw = row;
    // Khóa của dòng CSV đã được canonical hóa; khóa của JSON thì chưa.
    const pick = (field: keyof typeof COLUMN_ALIASES): unknown => {
      for (const [key, value] of Object.entries(row)) {
        const canonical = this.canonical(key);
        if (COLUMN_ALIASES[field].includes(canonical)) return value;
      }
      return undefined;
    };

    const dateValue = pick('transactionDate');
    const transactionDate = this.toIsoDate(dateValue);
    if (!transactionDate) {
      throw new BadRequestException(
        `Dòng sao kê thiếu ngày giao dịch hợp lệ (YYYY-MM-DD): ${JSON.stringify(row)}`,
      );
    }

    const currency =
      this.toText(pick('currency'))?.toUpperCase() ?? defaultCurrency;

    const { amount, direction } = this.resolveAmountAndDirection(row, pick);

    return {
      transactionDate,
      valueDate: this.toIsoDate(pick('valueDate')),
      description: this.toText(pick('description')),
      reference: this.toText(pick('reference')),
      bankRef: this.toText(pick('bankRef')),
      direction,
      amount,
      currency,
      raw,
    };
  }

  private resolveAmountAndDirection(
    row: Record<string, unknown>,
    pick: (field: keyof typeof COLUMN_ALIASES) => unknown,
  ): { amount: string; direction: BankTransactionDirection } {
    const explicit = this.toText(pick('direction'));
    const credit = this.toAmount(pick('credit'));
    const debit = this.toAmount(pick('debit'));
    const amount = this.toAmount(pick('amount'));

    // (2) Cặp cột credit/debit — ưu tiên hơn dấu của `amount` vì rõ nghĩa hơn.
    if (credit !== null && !credit.isZero()) {
      return { amount: moneyToString(credit), direction: BankTransactionDirection.IN };
    }
    if (debit !== null && !debit.isZero()) {
      return { amount: moneyToString(debit), direction: BankTransactionDirection.OUT };
    }

    // (1) Cột direction khai tường minh.
    if (explicit) {
      const direction = this.toDirection(explicit);
      if (direction && amount !== null && !amount.isZero()) {
        return { amount: moneyToString(amount.abs()), direction };
      }
    }

    // (3) Dấu của amount.
    if (amount !== null && !amount.isZero()) {
      return {
        amount: moneyToString(amount.abs()),
        direction: amount.isNegative()
          ? BankTransactionDirection.OUT
          : BankTransactionDirection.IN,
      };
    }

    throw new BadRequestException(
      `Dòng sao kê không xác định được số tiền/chiều tiền: ${JSON.stringify(row)}`,
    );
  }

  private toDirection(value: string): BankTransactionDirection | null {
    const normalized = this.canonical(value);
    if (DIRECTION_IN.has(normalized)) return BankTransactionDirection.IN;
    if (DIRECTION_OUT.has(normalized)) return BankTransactionDirection.OUT;
    return null;
  }

  private toIsoDate(value: unknown): string | null {
    const text = this.toText(value);
    if (!text) return null;
    if (isIsoDate(text)) return text;

    // Hỗ trợ `DD/MM/YYYY` và `DD-MM-YYYY` — định dạng phổ biến của sao kê VN.
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (match) {
      const [, day, month, year] = match;
      const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      if (isIsoDate(candidate)) return candidate;
    }
    return null;
  }

  private toAmount(value: unknown): ReturnType<typeof toMoney> | null {
    if (value === null || value === undefined) return null;
    const text = String(value)
      .trim()
      .replace(/[.\s]/g, (match) => (match === ' ' ? '' : match))
      .replace(/,/g, '.');
    if (text === '' || text === '-') return null;

    // `1.234.567,89` (định dạng VN) hoặc `1,234,567.89` (định dạng EN).
    const cleaned = this.normalizeNumericText(text);
    if (cleaned === null) return null;

    try {
      return toMoney(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Chuẩn hóa chuỗi số về dạng `1234.56`.
   *
   * Quy tắc: dấu phân cách **cuối cùng** là dấu thập phân nếu nó có 1–2 chữ số
   * theo sau; còn lại là dấu phân cách nghìn. Cách này xử lý đúng cả `1.234.567`
   * (không thập phân) và `1.234,56`.
   */
  private normalizeNumericText(text: string): string | null {
    const plain = text.replace(/[^\d.,-]/g, '');
    if (plain === '' || plain === '-') return null;

    const negative = plain.startsWith('-');
    const body = plain.replace(/^-/, '');
    const lastDot = body.lastIndexOf('.');
    const lastComma = body.lastIndexOf(',');
    const lastSeparator = Math.max(lastDot, lastComma);

    let normalized: string;
    if (lastSeparator === -1) {
      normalized = body;
    } else {
      const decimals = body.length - lastSeparator - 1;
      const integerPart = body.slice(0, lastSeparator).replace(/[.,]/g, '');
      const decimalPart = body.slice(lastSeparator + 1).replace(/[.,]/g, '');
      normalized = decimals > 0 && decimals <= 4 ? `${integerPart}.${decimalPart}` : integerPart;
    }

    if (normalized === '' || !MONEY_PATTERN.test(normalized)) return null;
    return negative ? `-${normalized}` : normalized;
  }

  private toText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text === '' ? null : text;
  }

  /** Bỏ dấu cách, gạch dưới, gạch ngang và viết thường để so khớp tên cột. */
  private canonical(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[_\-\s]+/g, '');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
