import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { AuthTokens, AuthUser, Role } from '../types/api'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  setSession: (
    tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>,
    user?: AuthUser | null,
  ) => void
  setUser: (user: AuthUser | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: (tokens, user) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: user === undefined ? get().user : user,
        }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'al-auth' },
  ),
)

export function hasRole(user: AuthUser | null, role: Role): boolean {
  return Boolean(user?.roles?.includes(role))
}
