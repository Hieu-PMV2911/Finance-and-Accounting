import { api } from '@/lib/api'
import { scopeParams } from '@/lib/scope'
import type { SubLedger, SubLedgerQuery } from '@/types/api'

export async function fetchSubLedger(query: SubLedgerQuery): Promise<SubLedger> {
  const { partyId, accountId, limit, offset, ...scope } = query
  const params: Record<string, string> = {
    partyId,
    ...scopeParams(scope),
  }
  if (accountId) params.accountId = accountId
  if (limit !== undefined) params.limit = String(limit)
  if (offset !== undefined) params.offset = String(offset)

  const { data } = await api.get<SubLedger>('/ledger/sub-ledger', { params })
  return data
}
