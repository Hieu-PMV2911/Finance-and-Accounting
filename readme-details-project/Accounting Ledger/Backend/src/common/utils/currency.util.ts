import { Decimal } from 'decimal.js';

import {
  MONEY_SCALE,
  moneyToString,
  toMoney,
} from './money.util.js';

/**
 * Tiện ích ngoại tệ (mục 10.C.1).
 *
 * Bất biến trung tâm của quyết định #3:
 * - `debit`/`credit` **luôn** là tiền hạch toán (`companies.baseCurrency`).
 * - Ngoại tệ nằm ở `currency` / `fx_amount` / `fx_rate` **trên cùng dòng**.
 *
 * Nhờ vậy Σ Nợ = Σ Có không đổi, và mọi báo cáo/trial balance hiện có **không phải
 * sửa** — chúng vốn chỉ đọc `debit`/`credit`.
 */

/** Mã tiền ISO 4217: đúng 3 chữ cái in hoa. */
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Số chữ số thập phân của tỷ giá.
 *
 * Rộng hơn tiền (4) vì tỷ giá thật có tới 6–8 chữ số thập phân (vd JPY→VND có thể
 * là `0.00004231`). Làm tròn tỷ giá xuống 4 chữ số sẽ tạo sai lệch đáng kể khi nhân
 * với số tiền lớn.
 */
export const FX_RATE_SCALE = 8;

/** Tỷ giá tối đa theo `NUMERIC(19,8)`: 11 chữ số phần nguyên. */
const MAX_FX_RATE = new Decimal('99999999999.99999999');

/** Chuẩn hóa mã tiền về dạng lưu trữ: in hoa, bỏ khoảng trắng. */
export function normalizeCurrencyCode(value: string): string {
  return value.trim().toUpperCase();
}

/** Mã tiền có hợp lệ theo ISO 4217 (3 chữ cái)? */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_CODE_PATTERN.test(value);
}

/** Chuẩn hóa tỷ giá về chuỗi 8 chữ số thập phân để ghi DB. */
export function fxRateToString(value: string | number | Decimal): string {
  return toMoney(value)
    .toDecimalPlaces(FX_RATE_SCALE, Decimal.ROUND_HALF_UP)
    .toFixed(FX_RATE_SCALE);
}

/** Tỷ giá vượt quá giới hạn `NUMERIC(19,8)` ⇒ sẽ tràn cột khi ghi DB. */
export function exceedsFxRateRange(value: string | number | Decimal): boolean {
  return toMoney(value).abs().greaterThan(MAX_FX_RATE);
}

/**
 * Quy đổi **một số tiền ngoại tệ** về tiền hạch toán.
 *
 * Đây là **phép tính duy nhất** được dùng để suy ra `debit`/`credit` từ
 * `fx_amount × fx_rate` — mọi nơi khác phải gọi hàm này thay vì tự nhân, để quy tắc
 * làm tròn chỉ tồn tại ở một chỗ.
 *
 * Làm tròn về 4 chữ số thập phân (thang của cột tiền). Lưu ý hệ quả: khi một bút
 * toán có nhiều dòng ngoại tệ, tổng **sau khi làm tròn từng dòng** có thể lệch vài
 * đơn vị so với tổng ngoại tệ × tỷ giá. Vì vậy `JournalsService` kiểm tra cân bằng
 * trên giá trị **đã làm tròn** (giá trị thật sự được ghi), và từ chối nếu lệch —
 * không âm thầm nhồi phần lệch vào một dòng nào.
 */
export function convertToBase(
  fxAmount: string | number | Decimal,
  fxRate: string | number | Decimal,
): string {
  return moneyToString(toMoney(fxAmount).times(toMoney(fxRate)));
}

/**
 * Chênh lệch giữa giá trị đã ghi nhận và giá trị tất toán, tính bằng tiền hạch toán.
 *
 * Trả về số **có dấu**: dương = tất toán thu được nhiều hơn (lãi), âm = ít hơn (lỗ).
 * Việc quyết định đó là lãi hay lỗ thuộc về nơi gọi (`FxDifferenceService`), hàm này
 * chỉ làm phép trừ để quy tắc dấu nằm một chỗ.
 */
export function fxDifference(
  bookedBase: string | number | Decimal,
  settledBase: string | number | Decimal,
): string {
  return moneyToString(toMoney(settledBase).minus(toMoney(bookedBase)));
}

/** Hệ số quy đổi ngược (1 đơn vị tiền hạch toán = ? ngoại tệ) — dùng cho đánh giá lại. */
export function invertRate(
  rate: string | number | Decimal,
): string {
  const value = toMoney(rate);
  if (value.isZero()) {
    throw new Error('Không thể nghịch đảo tỷ giá bằng 0');
  }
  return fxRateToString(new Decimal(1).dividedBy(value));
}

/** Số chữ số thập phân chuẩn của tiền — export lại để nơi gọi không phải import hai chỗ. */
export { MONEY_SCALE };
