import { api } from '../../lib/api'
import type {
  CreateUserPayload,
  UpdateUserPayload,
  User,
} from '../../types/api'

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users')
  return data
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post<User>('/users', payload)
  return data
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, payload)
  return data
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { newPassword })
}
