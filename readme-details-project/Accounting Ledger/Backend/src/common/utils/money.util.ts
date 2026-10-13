// `decimal.js` có cả `export default` (trỏ vào namespace) và named export `Decimal`
// (class + namespace + hàm được gộp). Chỉ named import mới dùng được `Decimal`
// vừa như giá trị vừa như kiểu dữ liệu.
import { Decimal } from 'decimal.js';

/**
 * Tiện ích số học tiền tệ.
 *
 * Bất biến số 5 của hệ thống: tiền lưu bằng `NUMERIC(19,4)` trong DB và tính
 * bằng `decimal.js` trong code — **TUYỆT ĐỐI KHÔNG dùng `number`/float** cho số tiền.
 *
 * Lưu ý về kiểu dữ liệu:
 * - Postgres trả cột `numeric` về dưới dạng **chuỗi**, nên mọi giá trị đọc từ DB
 *   đều đi qua `toMoney()` trước khi tính.
 * - DTO nhận tiền dưới dạng **chuỗi** (`"1000000.0000"`) để không mất mát khi
 *   JSON.parse biến số thành float.
 */

// 19 chữ số phần nguyên + 4 chữ số thập phân ⇒ cần độ chính xác rộng rãi.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/** Số chữ số thập phân của cột tiền trong DB. */
export const MONEY_SCALE = 4;

/** Giá trị tiền tối đa theo `NUMERIC(19,4)`: 15 chữ số phần nguyên. */
const MAX_MONEY = new Decimal('999999999999999.9999');

/** Chuỗi số tiền hợp lệ: tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân. */
export const MONEY_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/** Chuyển bất kỳ giá trị nào (chuỗi từ DB, chuỗi từ DTO, Decimal) về `Decimal`. */
export function toMoney(
  value: string | number | Decimal | null | undefined,
): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value);
}

/** Tổng một danh sách tiền. */
export function sumMoney(
  values: readonly (string | number | Decimal)[],
): Decimal {
  return values.reduce<Decimal>(
    (acc, value) => acc.plus(toMoney(value)),
    new Decimal(0),
  );
}

/** Chuẩn hóa về chuỗi 4 chữ số thập phân để ghi vào DB. */
export function moneyToString(value: string | number | Decimal): string {
  return toMoney(value)
    .toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP)
    .toFixed(MONEY_SCALE);
}

export function isZeroMoney(value: string | number | Decimal): boolean {
  return toMoney(value).isZero();
}

export function isPositiveMoney(value: string | number | Decimal): boolean {
  return toMoney(value).greaterThan(0);
}

export function isNegativeMoney(value: string | number | Decimal): boolean {
  return toMoney(value).lessThan(0);
}

export function moneyEquals(
  a: string | number | Decimal,
  b: string | number | Decimal,
): boolean {
  return toMoney(a).equals(toMoney(b));
}

/** Vượt quá giới hạn `NUMERIC(19,4)` ⇒ sẽ tràn cột khi ghi DB. */
export function exceedsMoneyRange(value: string | number | Decimal): boolean {
  return toMoney(value).abs().greaterThan(MAX_MONEY);
}
