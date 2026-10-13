import { api } from '@/lib/api'
import type {
  AccountBalance,
  CreateFiscalPeriodPayload,
  FiscalPeriod,
  FiscalPeriodFilters,
  UpdateFiscalPeriodPayload,
} from '@/types/api'

function cleanParams(filters: FiscalPeriodFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.status) params.status = filters.status
  if (filters.year) params.year = String(filters.year)
  if (filters.date) params.date = filters.date
  if (filters.search?.trim()) params.search = filters.search.trim()
  return params
}

export async function listFiscalPeriods(
  filters: FiscalPeriodFilters = {},
): Promise<FiscalPeriod[]> {
  const { data } = await api.get<FiscalPeriod[]>('/fiscal-periods', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchFiscalPeriod(id: string): Promise<FiscalPeriod> {
  const { data } = await api.get<FiscalPeriod>(`/fiscal-periods/${id}`)
  return data
}

/** Số dư đầu kỳ / phát sinh / cuối kỳ của mọi tài khoản trong kỳ. */
export async function fetchPeriodBalances(
  id: string,
): Promise<AccountBalance[]> {
  const { data } = await api.get<AccountBalance[]>(
    `/fiscal-periods/${id}/balances`,
  )
  return data
}

export async function createFiscalPeriod(
  payload: CreateFiscalPeriodPayload,
): Promise<FiscalPeriod> {
  const { data } = await api.post<FiscalPeriod>('/fiscal-periods', payload)
  return data
}

export async function updateFiscalPeriod(
  id: string,
  payload: UpdateFiscalPeriodPayload,
): Promise<FiscalPeriod> {
  const { data } = await api.patch<FiscalPeriod>(
    `/fiscal-periods/${id}`,
    payload,
  )
  return data
}

export async function deleteFiscalPeriod(id: string): Promise<void> {
  await api.delete(`/fiscal-periods/${id}`)
}

/** Mở lại kỳ đã tạm khóa (kỳ `closed` không thể mở lại). */
export async function openFiscalPeriod(id: string): Promise<FiscalPeriod> {
  const { data } = await api.post<FiscalPeriod>(`/fiscal-periods/${id}/open`)
  return data
}

/** Tạm khóa kỳ — đóng băng toàn bộ bút toán, còn mở lại được. */
export async function lockFiscalPeriod(id: string): Promise<FiscalPeriod> {
  const { data } = await api.post<FiscalPeriod>(`/fiscal-periods/${id}/lock`)
  return data
}

/** Chốt kỳ vĩnh viễn và kết chuyển số dư sang kỳ kế tiếp. */
export async function closeFiscalPeriod(id: string): Promise<FiscalPeriod> {
  const { data } = await api.post<FiscalPeriod>(`/fiscal-periods/${id}/close`)
  return data
}
