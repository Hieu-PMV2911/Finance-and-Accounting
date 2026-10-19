/**
 * Số học tiền tệ ở tầng giao diện.
 *
 * Tiền trong hệ thống là **chuỗi** `NUMERIC(19,4)` — không bao giờ gửi `number`
 * lên API để tránh `JSON.parse` làm tròn. Ở đây chỉ tính toán để hiển thị và
 * dựng payload; backend **tính lại và kiểm** (`Σ dòng = subtotal`,
 * `subtotal + thuế = total`) nên sai lệch sẽ bị từ chối chứ không âm thầm vào sổ.
 */

/** 10^4 — cùng độ chính xác với cột `NUMERIC(19,4)`. */
const SCALE = 10_000

/** Chuẩn hóa một giá trị người dùng nhập về chuỗi 4 chữ số thập phân. */
export function toMoneyString(value: string): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0.0000'
  return (Math.round(parsed * SCALE) / SCALE).toFixed(4)
}

/** `số lượng × đơn giá`, làm tròn 4 chữ số thập phân. */
export function lineAmount(quantity: string, unitPrice: string): string {
  const q = Number(quantity)
  const p = Number(unitPrice)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return '0.0000'
  return (Math.round(q * p * SCALE) / SCALE).toFixed(4)
}

/** Tổng các chuỗi tiền — cộng bằng đơn vị 1/10000 để tránh sai số cộng dồn. */
export function sumAmounts(values: readonly string[]): string {
  const total = values.reduce((acc, value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? acc + Math.round(parsed * SCALE) : acc
  }, 0)
  return (total / SCALE).toFixed(4)
}

/** `a − b` (có thể âm) — dùng để hiển thị số còn lại của phiếu thu/chi. */
export function subtractAmounts(a: string, b: string): string {
  const left = Number(a)
  const right = Number(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return '0.0000'
  return ((Math.round(left * SCALE) - Math.round(right * SCALE)) / SCALE).toFixed(
    4,
  )
}
