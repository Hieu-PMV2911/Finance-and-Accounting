import { api } from '../../lib/api'
import type { UpdateProfilePayload, User } from '../../types/api'

export async function fetchProfile(): Promise<User> {
  const { data } = await api.get<User>('/profile')
  return data
}

export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<User> {
  const { data } = await api.patch<User>('/profile', payload)
  return data
}
