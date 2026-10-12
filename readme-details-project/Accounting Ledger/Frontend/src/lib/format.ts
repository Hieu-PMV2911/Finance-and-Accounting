import dayjs from 'dayjs'

export function formatDateTime(value?: string | null): string {
  return value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '—'
}

export function formatDate(value?: string | null): string {
  return value ? dayjs(value).format('DD/MM/YYYY') : '—'
}
