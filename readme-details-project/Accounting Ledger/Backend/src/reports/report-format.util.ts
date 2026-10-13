/**
 * Định dạng số để hiển thị trên báo cáo xuất ra file (Excel/PDF).
 *
 * Quy ước Việt Nam: `.` ngăn nghìn, `,` ngăn thập phân. Số thập phân bằng 0
 * được cắt bỏ để bảng gọn mắt (`'1500000.0000'` → `'1.500.000'`).
 *
 * Tiền vẫn giữ nguyên dạng **chuỗi** từ đầu đến cuối — chỉ định dạng để hiển
 * thị, không bao giờ chuyển sang `number`.
 */
export function formatMoneyDisplay(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;

  const negative = raw.startsWith('-');
  const [intPart, decPart = ''] = raw.replace(/^-/, '').split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = decPart.replace(/0+$/, '');
  const body = decimals ? `${grouped},${decimals}` : grouped;
  return negative ? `-${body}` : body;
}

/** Phần trăm đã tính sẵn (`'12.34'` → `'12,34%'`); `null` → `'—'`. */
export function formatPercentDisplay(value: string | null): string {
  if (value === null) return '—';
  return `${value.replace('.', ',')}%`;
}

/** `2026-01-31` → `31/01/2026`. */
export function formatDateDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
