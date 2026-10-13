import { api } from '@/lib/api'
import type {
  AuditFilters,
  AuditLog,
  JournalTraceability,
} from '@/types/api'

function cleanParams(filters: AuditFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.entity?.trim()) params.entity = filters.entity.trim()
  if (filters.entityId?.trim()) params.entityId = filters.entityId.trim()
  if (filters.actorId) params.actorId = filters.actorId
  if (filters.action) params.action = filters.action
  if (filters.fromDate) params.fromDate = filters.fromDate
  if (filters.toDate) params.toDate = filters.toDate
  if (filters.search?.trim()) params.search = filters.search.trim()
  if (filters.limit !== undefined) params.limit = String(filters.limit)
  if (filters.offset !== undefined) params.offset = String(filters.offset)
  return params
}

/** Danh sách vết kiểm toán (mới nhất trước), có lọc. Chỉ admin. */
export async function listAuditLogs(
  filters: AuditFilters = {},
): Promise<AuditLog[]> {
  const { data } = await api.get<AuditLog[]>('/audit-logs', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchAuditLog(id: string): Promise<AuditLog> {
  const { data } = await api.get<AuditLog>(`/audit-logs/${id}`)
  return data
}

/** Toàn bộ vết của một bản ghi, theo thứ tự thời gian (cũ → mới). */
export async function traceEntity(
  entity: string,
  entityId: string,
): Promise<AuditLog[]> {
  const { data } = await api.get<AuditLog[]>(
    `/audit-logs/trace/${encodeURIComponent(entity)}/${encodeURIComponent(entityId)}`,
  )
  return data
}

/** Truy vết bút toán: dòng định khoản → kỳ → chứng từ nguồn → vết kiểm toán. */
export async function traceJournalEntry(
  id: string,
): Promise<JournalTraceability> {
  const { data } = await api.get<JournalTraceability>(
    `/audit-logs/traceability/journal-entries/${id}`,
  )
  return data
}
