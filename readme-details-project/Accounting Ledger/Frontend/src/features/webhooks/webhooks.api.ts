import { api } from '@/lib/api'
import type {
  CreateWebhookEndpointPayload,
  EmitWebhookEventPayload,
  UpdateWebhookEndpointPayload,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookInboundEvent,
  WebhookStats,
} from '@/types/api'

export async function listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  const { data } = await api.get<WebhookEndpoint[]>('/webhooks/endpoints')
  return data
}

export async function createWebhookEndpoint(
  payload: CreateWebhookEndpointPayload,
): Promise<WebhookEndpoint> {
  const { data } = await api.post<WebhookEndpoint>('/webhooks/endpoints', payload)
  return data
}

export async function updateWebhookEndpoint(
  id: string,
  payload: UpdateWebhookEndpointPayload,
): Promise<WebhookEndpoint> {
  const { data } = await api.patch<WebhookEndpoint>(
    `/webhooks/endpoints/${id}`,
    payload,
  )
  return data
}

export async function deleteWebhookEndpoint(id: string): Promise<void> {
  await api.delete(`/webhooks/endpoints/${id}`)
}

export interface DeliveryFilters {
  endpointId?: string
  status?: string
  limit?: number
}

export async function listWebhookDeliveries(
  filters: DeliveryFilters = {},
): Promise<WebhookDelivery[]> {
  const params: Record<string, string> = {}
  if (filters.endpointId) params.endpointId = filters.endpointId
  if (filters.status) params.status = filters.status
  if (filters.limit !== undefined) params.limit = String(filters.limit)

  const { data } = await api.get<WebhookDelivery[]>('/webhooks/deliveries', {
    params,
  })
  return data
}

export async function retryWebhookDelivery(id: string): Promise<WebhookDelivery> {
  const { data } = await api.post<WebhookDelivery>(
    `/webhooks/deliveries/${id}/retry`,
  )
  return data
}

export async function fetchWebhookStats(): Promise<WebhookStats> {
  const { data } = await api.get<WebhookStats>('/webhooks/stats')
  return data
}

/** Phát một sự kiện ra các endpoint đã đăng ký (chống giao trùng theo khóa). */
export async function emitWebhookEvent(
  payload: EmitWebhookEventPayload,
): Promise<WebhookDelivery[]> {
  const { data } = await api.post<WebhookDelivery[]>('/webhooks/events', payload)
  return data
}

/** Webhook nhận từ hệ thống ngoài, kèm lần bị bỏ qua (trùng / đến trễ). */
export async function listWebhookEvents(
  limit = 50,
): Promise<WebhookInboundEvent[]> {
  const { data } = await api.get<WebhookInboundEvent[]>('/webhooks/events', {
    params: { limit: String(limit) },
  })
  return data
}
