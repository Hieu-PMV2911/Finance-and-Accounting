/**
 * Số học tiền ở frontend.
 *
 * Tiền được API trả về dưới dạng **chuỗi** (`numeric(19,4)` của Postgres) và
 * phải giữ nguyên dạng chuỗi khi gửi lên. Để cộng/so sánh mà không dính sai số
 * dấu phẩy động, ta quy về **đơn vị nhỏ nhất** (×10^4) dưới dạng `BigInt` —
 * chính xác tuyệt đối với mọi giá trị trong giới hạn `NUMERIC(19,4)`.
 *
 * TUYỆT ĐỐI KHÔNG dùng `Number`/float cho số tiền (bất biến số 5).
 */

export const MONEY_SCALE = 4

/** Số tiền hợp lệ theo DTO của backend: tối đa 15 chữ số nguyên, 4 chữ số thập phân. */
export const MONEY_INPUT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/

/** Chuỗi tiền → đơn vị nhỏ nhất (×10^4). Chuỗi không hợp lệ trả về `0n`. */
export function toMinor(value: string | number | null | undefined): bigint {
  const raw = String(value ?? '').trim()
  if (!raw) return 0n

  const match = /^-?(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!match) return 0n

  const sign = raw.startsWith('-') ? '-' : ''
  const intPart = match[1] || '0'
  const decimals = (match[2] ?? '').padEnd(MONEY_SCALE, '0').slice(0, MONEY_SCALE)
  return BigInt(`${sign}${intPart}${decimals}`)
}

/** Đơn vị nhỏ nhất → chuỗi tiền 4 chữ số thập phân (`'1500000.0000'`). */
export function fromMinor(minor: bigint): string {
  const negative = minor < 0n
  const abs = (negative ? -minor : minor)
    .toString()
    .padStart(MONEY_SCALE + 1, '0')
  const intPart = abs.slice(0, -MONEY_SCALE)
  const decPart = abs.slice(-MONEY_SCALE)
  return `${negative ? '-' : ''}${intPart}.${decPart}`
}

/** Tổng nhiều chuỗi tiền — trả về đơn vị nhỏ nhất. */
export function sumMinor(
  values: readonly (string | number | null | undefined)[],
): bigint {
  return values.reduce<bigint>((total, item) => total + toMinor(item), 0n)
}

/** Tổng nhiều chuỗi tiền — trả về chuỗi 4 chữ số thập phân. */
export function sumMoney(
  values: readonly (string | number | null | undefined)[],
): string {
  return fromMinor(sumMinor(values))
}

export function isZeroMoney(value: string | number | null | undefined): boolean {
  return toMinor(value) === 0n
}

export function isPositiveMoney(
  value: string | number | null | undefined,
): boolean {
  return toMinor(value) > 0n
}

export function moneyEquals(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  return toMinor(a) === toMinor(b)
}

/** Người dùng có đang gõ một số tiền hợp lệ (hoặc chuỗi rỗng) hay không. */
export function isValidMoneyInput(value: string): boolean {
  const raw = value.trim()
  return raw === '' || MONEY_INPUT_PATTERN.test(raw)
}

/**
 * Chuẩn hóa ô nhập tiền trước khi gửi API:
 * rỗng → `undefined` (bỏ hẳn một bên Nợ/Có), ngược lại → chuỗi 4 chữ số thập phân.
 */
export function normalizeMoneyInput(value: string): string | undefined {
  const raw = value.trim()
  if (!raw) return undefined
  if (!MONEY_INPUT_PATTERN.test(raw)) return undefined
  return fromMinor(toMinor(raw))
}
