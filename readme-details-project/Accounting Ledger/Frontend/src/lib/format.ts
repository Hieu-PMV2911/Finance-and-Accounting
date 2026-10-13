import dayjs from 'dayjs'

export function formatDateTime(value?: string | null): string {
  return value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '—'
}

export function formatDate(value?: string | null): string {
  return value ? dayjs(value).format('DD/MM/YYYY') : '—'
}

/** `YYYY-MM-DD` — dùng cho `<input type="date">` và tham số lọc của API. */
export function formatDateInput(value?: dayjs.ConfigType): string {
  return value ? dayjs(value).format('YYYY-MM-DD') : ''
}

/**
 * Định dạng tiền theo quy ước Việt Nam: `.` ngăn nghìn, `,` ngăn thập phân.
 *
 * Số thập phân bằng 0 được cắt bỏ (`'1500000.0000'` → `'1.500.000'`) để bảng
 * kế toán gọn mắt; số dư lẻ vẫn hiển thị đủ 4 chữ số.
 */
export function formatMoney(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—'
  const raw = String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw

  const negative = raw.startsWith('-')
  const [intPart, decPart = ''] = raw.replace(/^-/, '').split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimals = decPart.replace(/0+$/, '')
  const body = decimals ? `${grouped},${decimals}` : grouped
  return negative ? `-${body}` : body
}

/**
 * Chuỗi phần trăm do backend tính sẵn (`'12.34'` → `'12,34%'`).
 * `null`/rỗng → `'—'` (vd kỳ không phát sinh doanh thu nên không có biên lợi nhuận).
 */
export function formatPercent(value?: string | null): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${String(value).replace('.', ',')}%`
}
