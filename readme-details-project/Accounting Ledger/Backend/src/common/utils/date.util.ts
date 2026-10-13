const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kiểm tra chuỗi có phải ngày hợp lệ theo định dạng `YYYY-MM-DD`.
 * Không chỉ khớp mẫu mà còn xác nhận ngày có thật (chặn `2026-02-31`).
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * So sánh hai ngày `YYYY-MM-DD`.
 * Trả về số âm nếu `a < b`, 0 nếu bằng, số dương nếu `a > b`.
 *
 * So sánh chuỗi là đủ vì định dạng ISO có thứ tự từ điển trùng thứ tự thời gian.
 */
export function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
