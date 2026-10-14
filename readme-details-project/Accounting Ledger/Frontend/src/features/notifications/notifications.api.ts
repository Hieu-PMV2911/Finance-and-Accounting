import { api } from '@/lib/api'
import type { AppNotification, NotificationFilters } from '@/types/api'

function cleanParams(filters: NotificationFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.type) params.type = filters.type
  if (filters.status) params.status = filters.status
  if (filters.severity) params.severity = filters.severity
  if (filters.search?.trim()) params.search = filters.search.trim()
  if (filters.limit !== undefined) params.limit = String(filters.limit)
  if (filters.offset !== undefined) params.offset = String(filters.offset)
  return params
}

/** Danh sách thông báo nhìn thấy được (lọc theo người dùng & vai trò ở backend). */
export async function listNotifications(
  filters: NotificationFilters = {},
): Promise<AppNotification[]> {
  const { data } = await api.get<AppNotification[]>('/notifications', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count')
  return data.count
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  const { data } = await api.post<AppNotification>(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data } = await api.post<{ updated: number }>('/notifications/read-all')
  return data.updated
}
