const UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/**
 * Chuyển chuỗi thời lượng ('30s', '15m', '1h', '7d') thành giây.
 * Mặc định đơn vị là giây nếu không ghi.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Thời lượng không hợp lệ: "${value}"`);
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? 's').toLowerCase();
  return amount * (UNITS[unit] ?? 1);
}
