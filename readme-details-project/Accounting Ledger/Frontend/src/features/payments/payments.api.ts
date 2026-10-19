import { api } from '@/lib/api'
import type {
  CreateAllocationPayload,
  CreatePaymentPayload,
  Payment,
  PaymentAllocation,
  PaymentFilters,
  UpdatePaymentPayload,
  VoidDocumentPayload,
} from '@/types/api'

function cleanParams(filters: PaymentFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.direction) params.direction = filters.direction
  if (filters.status) params.status = filters.status
  if (filters.method) params.method = filters.method
  if (filters.partyId) params.partyId = filters.partyId
  if (filters.fromDate) params.fromDate = filters.fromDate
  if (filters.toDate) params.toDate = filters.toDate
  if (filters.search?.trim()) params.search = filters.search.trim()
  return params
}

export async function listPayments(
  filters: PaymentFilters = {},
): Promise<Payment[]> {
  const { data } = await api.get<Payment[]>('/payments', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchPayment(id: string): Promise<Payment> {
  const { data } = await api.get<Payment>(`/payments/${id}`)
  return data
}

export async function createPayment(
  payload: CreatePaymentPayload,
): Promise<Payment> {
  const { data } = await api.post<Payment>('/payments', payload)
  return data
}

export async function updatePayment(
  id: string,
  payload: UpdatePaymentPayload,
): Promise<Payment> {
  const { data } = await api.patch<Payment>(`/payments/${id}`, payload)
  return data
}

export async function approvePayment(id: string): Promise<Payment> {
  const { data } = await api.post<Payment>(`/payments/${id}/approve`)
  return data
}

export async function postPayment(id: string): Promise<Payment> {
  const { data } = await api.post<Payment>(`/payments/${id}/post`)
  return data
}

export async function voidPayment(
  id: string,
  payload: VoidDocumentPayload,
): Promise<Payment> {
  const { data } = await api.post<Payment>(`/payments/${id}/void`, payload)
  return data
}

// ----- Phân bổ công nợ -----

export async function listPaymentAllocations(
  paymentId: string,
): Promise<PaymentAllocation[]> {
  const { data } = await api.get<PaymentAllocation[]>(
    `/payments/${paymentId}/allocations`,
  )
  return data
}

/**
 * **Đặt** số tiền phân bổ của phiếu vào một hóa đơn.
 *
 * Idempotent theo cặp (phiếu, hóa đơn): gửi lại cùng số tiền cho kết quả y hệt.
 * Backend chặn khi vượt số còn lại của phiếu hoặc của hóa đơn.
 */
export async function allocatePayment(
  paymentId: string,
  payload: CreateAllocationPayload,
): Promise<PaymentAllocation> {
  const { data } = await api.post<PaymentAllocation>(
    `/payments/${paymentId}/allocations`,
    payload,
  )
  return data
}

export async function removeAllocation(
  paymentId: string,
  allocationId: string,
): Promise<void> {
  await api.delete(`/payments/${paymentId}/allocations/${allocationId}`)
}
