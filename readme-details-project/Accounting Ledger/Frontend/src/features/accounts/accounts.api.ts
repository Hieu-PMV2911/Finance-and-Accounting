import { api } from '../../lib/api'
import type {
  Account,
  AccountFilters,
  AccountNode,
  CreateAccountPayload,
  UpdateAccountPayload,
} from '../../types/api'

function cleanParams(filters: AccountFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.type) params.type = filters.type
  if (filters.isActive !== undefined) params.isActive = String(filters.isActive)
  if (filters.search?.trim()) params.search = filters.search.trim()
  if (filters.parentId) params.parentId = filters.parentId
  return params
}

export async function listAccounts(
  filters: AccountFilters = {},
): Promise<Account[]> {
  const { data } = await api.get<Account[]>('/accounts', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchAccountTree(): Promise<AccountNode[]> {
  const { data } = await api.get<AccountNode[]>('/accounts/tree')
  return data
}

export async function createAccount(
  payload: CreateAccountPayload,
): Promise<Account> {
  const { data } = await api.post<Account>('/accounts', payload)
  return data
}

export async function updateAccount(
  id: string,
  payload: UpdateAccountPayload,
): Promise<Account> {
  const { data } = await api.patch<Account>(`/accounts/${id}`, payload)
  return data
}

export async function deleteAccount(id: string): Promise<void> {
  await api.delete(`/accounts/${id}`)
}
