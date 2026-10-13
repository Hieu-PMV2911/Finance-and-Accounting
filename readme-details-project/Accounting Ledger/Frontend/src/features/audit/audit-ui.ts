import type { AuditAction } from '@/types/api'

/** Màu badge theo hành động — tạo (xanh), cập nhật (xanh dương), xóa (đỏ). */
export const ACTION_BADGE: Record<AuditAction, string> = {
  create: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  update: 'border-blue-200 bg-blue-50 text-blue-700',
  delete: 'border-rose-200 bg-rose-50 text-rose-700',
}

/** Hiển thị một giá trị `unknown` trong `before`/`after` thành chuỗi dễ đọc. */
export function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (typeof value === 'string') return value === '' ? '(rỗng)' : value
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

export interface FieldDiff {
  field: string
  before: unknown
  after: unknown
  changed: boolean
}

/**
 * So sánh `before`/`after` theo từng trường (hợp của hai tập khóa).
 * Trường chỉ có ở một bên cũng tính là thay đổi.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldDiff[] {
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).sort()

  return keys.map((field) => {
    const beforeValue = before?.[field]
    const afterValue = after?.[field]
    return {
      field,
      before: beforeValue,
      after: afterValue,
      changed: renderFieldValue(beforeValue) !== renderFieldValue(afterValue),
    }
  })
}
