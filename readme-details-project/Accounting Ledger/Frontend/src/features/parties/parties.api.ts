import { api } from '@/lib/api'
import type {
  CreatePartyPayload,
  Party,
  PartyFilters,
  PartyUsage,
  UpdatePartyPayload,
} from '@/types/api'

function cleanParams(filters: PartyFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.type) params.type = filters.type
  if (filters.isActive !== undefined) params.isActive = String(filters.isActive)
  if (filters.search?.trim()) params.search = filters.search.trim()
  return params
}

export async function listParties(filters: PartyFilters = {}): Promise<Party[]> {
  const { data } = await api.get<Party[]>('/parties', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchParty(id: string): Promise<Party> {
  const { data } = await api.get<Party>(`/parties/${id}`)
  return data
}

export async function fetchPartyUsage(id: string): Promise<PartyUsage> {
  const { data } = await api.get<PartyUsage>(`/parties/${id}/usage`)
  return data
}

export async function createParty(payload: CreatePartyPayload): Promise<Party> {
  const { data } = await api.post<Party>('/parties', payload)
  return data
}

export async function updateParty(
  id: string,
  payload: UpdatePartyPayload,
): Promise<Party> {
  const { data } = await api.patch<Party>(`/parties/${id}`, payload)
  return data
}

export async function deleteParty(id: string): Promise<void> {
  await api.delete(`/parties/${id}`)
}
