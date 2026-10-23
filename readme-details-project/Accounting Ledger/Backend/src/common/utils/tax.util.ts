import { Decimal } from 'decimal.js';

import { moneyToString, toMoney } from './money.util.js';

/**
 * Tiện ích tính thuế (mục 10.C.2).
 *
 * Quyết định đã chốt: thuế là **lớp tính trên dòng chứng từ** — dòng thuế sinh tự
 * động khi ghi sổ, không nhập tay vào bút toán. Vì vậy phép tính dưới đây là **nguồn
 * sự thật duy nhất** cho số thuế của một dòng; mọi nơi khác phải gọi nó thay vì tự
 * nhân chia, để quy tắc làm tròn chỉ tồn tại ở một chỗ.
 */

/** Số chữ số thập phân của thuế suất (khớp `NUMERIC(9,4)`). */
export const TAX_RATE_SCALE = 4;

/** Chuỗi thuế suất: tối đa 5 chữ số nguyên, tối đa 4 chữ số thập phân (0–100 thực tế). */
export const TAX_RATE_PATTERN = /^\d{1,5}(\.\d{1,4})?$/;

/** Thuế suất tối đa hợp lý — chặn lỗi gõ `1000` thay vì `10`. */
export const MAX_TAX_RATE_PERCENT = new Decimal('100');

/** Chuẩn hóa thuế suất về chuỗi 4 chữ số thập phân để ghi DB. */
export function taxRateToString(value: string | number | Decimal): string {
  return toMoney(value)
    .toDecimalPlaces(TAX_RATE_SCALE, Decimal.ROUND_HALF_UP)
    .toFixed(TAX_RATE_SCALE);
}

/**
 * Tính tiền thuế của một dòng.
 *
 * `rate` là **phần trăm** (10 = 10%). Kết quả làm tròn về 4 chữ số thập phân (thang
 * của cột tiền) — cùng quy tắc với mọi phép tính tiền khác trong hệ thống.
 *
 * Lưu ý hệ quả (giống ngoại tệ ở 10.C.1): tổng thuế của chứng từ là **tổng của các
 * dòng đã làm tròn**, không phải `tổng tiền × thuế suất`. Chênh lệch vài đơn vị là
 * bình thường và **có chủ ý** — bám theo dòng để mỗi dòng tự đối chiếu được với hóa
 * đơn giấy. Vì vậy `debit`/`credit` của dòng thuế luôn lấy từ phép cộng này.
 */
export function computeTaxAmount(
  amount: string | number | Decimal,
  ratePercent: string | number | Decimal,
): string {
  return moneyToString(
    toMoney(amount).times(toMoney(ratePercent)).dividedBy(100),
  );
}

/** Thuế suất có nằm trong khoảng hợp lệ `[0, 100]`? */
export function isTaxRateInRange(
  ratePercent: string | number | Decimal,
): boolean {
  const rate = toMoney(ratePercent);
  return !rate.isNegative() && rate.lessThanOrEqualTo(MAX_TAX_RATE_PERCENT);
}
