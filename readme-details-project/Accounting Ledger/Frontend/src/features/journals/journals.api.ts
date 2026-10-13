import { api } from '@/lib/api'
import type {
  CreateJournalEntryPayload,
  JournalEntry,
  JournalFilters,
  ReverseJournalPayload,
  UpdateJournalEntryPayload,
} from '@/types/api'

function cleanParams(filters: JournalFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.status) params.status = filters.status
  if (filters.periodId) params.periodId = filters.periodId
  if (filters.accountId) params.accountId = filters.accountId
  if (filters.fromDate) params.fromDate = filters.fromDate
  if (filters.toDate) params.toDate = filters.toDate
  if (filters.search?.trim()) params.search = filters.search.trim()
  if (filters.limit !== undefined) params.limit = String(filters.limit)
  if (filters.offset !== undefined) params.offset = String(filters.offset)
  return params
}

export async function listJournals(
  filters: JournalFilters = {},
): Promise<JournalEntry[]> {
  const { data } = await api.get<JournalEntry[]>('/journals', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchJournal(id: string): Promise<JournalEntry> {
  const { data } = await api.get<JournalEntry>(`/journals/${id}`)
  return data
}

/** Lập bút toán nháp. Gửi kèm `idempotencyKey` để chống tạo trùng. */
export async function createJournal(
  payload: CreateJournalEntryPayload,
): Promise<JournalEntry> {
  const { data } = await api.post<JournalEntry>('/journals', payload)
  return data
}

/** Chỉ sửa được bút toán nháp; gửi `lines` thì thay toàn bộ dòng cũ. */
export async function updateJournal(
  id: string,
  payload: UpdateJournalEntryPayload,
): Promise<JournalEntry> {
  const { data } = await api.patch<JournalEntry>(`/journals/${id}`, payload)
  return data
}

export async function deleteJournal(id: string): Promise<void> {
  await api.delete(`/journals/${id}`)
}

/** Nháp → đã xác nhận (admin hoặc người duyệt). */
export async function approveJournal(id: string): Promise<JournalEntry> {
  const { data } = await api.post<JournalEntry>(`/journals/${id}/approve`)
  return data
}

/**
 * Ghi sổ: cấp số hiệu, cập nhật số dư trong một transaction.
 * Idempotent — gọi lại không nhân đôi.
 */
export async function postJournal(id: string): Promise<JournalEntry> {
  const { data } = await api.post<JournalEntry>(`/journals/${id}/post`)
  return data
}

/**
 * Đảo bút toán đã ghi sổ bằng bút toán điều chỉnh (hoán đổi Nợ/Có).
 * Bút toán gốc chuyển sang `reversed`, lịch sử giữ nguyên.
 */
export async function reverseJournal(
  id: string,
  payload: ReverseJournalPayload,
): Promise<JournalEntry> {
  const { data } = await api.post<JournalEntry>(
    `/journals/${id}/reverse`,
    payload,
  )
  return data
}
