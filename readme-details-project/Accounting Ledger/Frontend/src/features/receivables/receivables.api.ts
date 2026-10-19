import { api } from '@/lib/api'
import type { AgingFilters, AgingView } from '@/types/api'

export type AgingKind = 'receivables' | 'payables'

const PATHS: Record<AgingKind, string> = {
  receivables: '/reports/receivables-aging',
  payables: '/reports/payables-aging',
}

function cleanParams(filters: AgingFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.asOfDate) params.asOfDate = filters.asOfDate
  if (filters.partyId) params.partyId = filters.partyId
  if (filters.includeSettled !== undefined) {
    params.includeSettled = String(filters.includeSettled)
  }
  return params
}

/**
 * Tuổi nợ phải thu / phải trả tại một ngày.
 *
 * Bất biến của báo cáo: **Σ các nhóm = Σ `outstanding` = `totalOutstanding`** —
 * backend đã kiểm bằng test, giao diện chỉ hiển thị lại đúng những con số đó.
 */
export async function fetchAging(
  kind: AgingKind,
  filters: AgingFilters = {},
): Promise<AgingView> {
  const { data } = await api.get<AgingView>(PATHS[kind], {
    params: cleanParams(filters),
  })
  return data
}
