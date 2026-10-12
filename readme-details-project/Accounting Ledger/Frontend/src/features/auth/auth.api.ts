import { api } from '../../lib/api'
import type {
  AuthTokens,
  AuthUser,
  ChangePasswordPayload,
} from '../../types/api'

export async function login(
  email: string,
  password: string,
): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/auth/login', { email, password })
  return data
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken })
}

export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  await api.post('/auth/change-password', payload)
}
