import { api } from '@/lib/api'
import type {
  CreateVendorBillPayload,
  UpdateVendorBillPayload,
  VendorBill,
  VendorBillFilters,
  VoidDocumentPayload,
} from '@/types/api'

function cleanParams(filters: VendorBillFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.partyId) params.partyId = filters.partyId
  if (filters.status) params.status = filters.status
  if (filters.billNo?.trim()) params.billNo = filters.billNo.trim()
  if (filters.fromDate) params.fromDate = filters.fromDate
  if (filters.toDate) params.toDate = filters.toDate
  return params
}

export async function listVendorBills(
  filters: VendorBillFilters = {},
): Promise<VendorBill[]> {
  const { data } = await api.get<VendorBill[]>('/vendor-bills', {
    params: cleanParams(filters),
  })
  return data
}

/** Chi tiết — chỉ endpoint này trả kèm `lines`. */
export async function fetchVendorBill(id: string): Promise<VendorBill> {
  const { data } = await api.get<VendorBill>(`/vendor-bills/${id}`)
  return data
}

export async function createVendorBill(
  payload: CreateVendorBillPayload,
): Promise<VendorBill> {
  const { data } = await api.post<VendorBill>('/vendor-bills', payload)
  return data
}

export async function updateVendorBill(
  id: string,
  payload: UpdateVendorBillPayload,
): Promise<VendorBill> {
  const { data } = await api.patch<VendorBill>(`/vendor-bills/${id}`, payload)
  return data
}

export async function approveVendorBill(id: string): Promise<VendorBill> {
  const { data } = await api.post<VendorBill>(`/vendor-bills/${id}/approve`)
  return data
}

export async function postVendorBill(id: string): Promise<VendorBill> {
  const { data } = await api.post<VendorBill>(`/vendor-bills/${id}/post`)
  return data
}

/** Hủy — hóa đơn đã ghi sổ sẽ sinh bút toán đảo ở backend. */
export async function voidVendorBill(
  id: string,
  payload: VoidDocumentPayload,
): Promise<VendorBill> {
  const { data } = await api.post<VendorBill>(
    `/vendor-bills/${id}/void`,
    payload,
  )
  return data
}
