import { api } from '@/lib/api'
import type {
  CreateSalesInvoicePayload,
  SalesInvoice,
  SalesInvoiceFilters,
  UpdateSalesInvoicePayload,
  VoidDocumentPayload,
} from '@/types/api'

function cleanParams(filters: SalesInvoiceFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.partyId) params.partyId = filters.partyId
  if (filters.status) params.status = filters.status
  if (filters.invoiceNo?.trim()) params.invoiceNo = filters.invoiceNo.trim()
  if (filters.fromDate) params.fromDate = filters.fromDate
  if (filters.toDate) params.toDate = filters.toDate
  return params
}

export async function listSalesInvoices(
  filters: SalesInvoiceFilters = {},
): Promise<SalesInvoice[]> {
  const { data } = await api.get<SalesInvoice[]>('/sales-invoices', {
    params: cleanParams(filters),
  })
  return data
}

/** Chi tiết — chỉ endpoint này trả kèm `lines`. */
export async function fetchSalesInvoice(id: string): Promise<SalesInvoice> {
  const { data } = await api.get<SalesInvoice>(`/sales-invoices/${id}`)
  return data
}

export async function createSalesInvoice(
  payload: CreateSalesInvoicePayload,
): Promise<SalesInvoice> {
  const { data } = await api.post<SalesInvoice>('/sales-invoices', payload)
  return data
}

export async function updateSalesInvoice(
  id: string,
  payload: UpdateSalesInvoicePayload,
): Promise<SalesInvoice> {
  const { data } = await api.patch<SalesInvoice>(`/sales-invoices/${id}`, payload)
  return data
}

export async function approveSalesInvoice(id: string): Promise<SalesInvoice> {
  const { data } = await api.post<SalesInvoice>(`/sales-invoices/${id}/approve`)
  return data
}

export async function postSalesInvoice(id: string): Promise<SalesInvoice> {
  const { data } = await api.post<SalesInvoice>(`/sales-invoices/${id}/post`)
  return data
}

/** Hủy — hóa đơn đã ghi sổ sẽ sinh bút toán đảo ở backend. */
export async function voidSalesInvoice(
  id: string,
  payload: VoidDocumentPayload,
): Promise<SalesInvoice> {
  const { data } = await api.post<SalesInvoice>(
    `/sales-invoices/${id}/void`,
    payload,
  )
  return data
}
