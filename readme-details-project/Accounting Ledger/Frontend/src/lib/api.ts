import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'

import { useAuthStore } from '../stores/auth.store'
import type { AuthTokens } from '../types/api'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const api = axios.create({ baseURL })

// Gắn access token vào mọi request.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Chỉ cho phép một luồng refresh chạy tại một thời điểm. */
let refreshInFlight: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) {
    throw new Error('NO_REFRESH_TOKEN')
  }

  const { data } = await axios.post<AuthTokens>(`${baseURL}/auth/refresh`, {
    refreshToken,
  })

  useAuthStore.getState().setSession(data)
  return data.accessToken
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined
    const status = error.response?.status
    const url = original?.url ?? ''
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh')

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true
      try {
        refreshInFlight = refreshInFlight ?? refreshAccessToken()
        const token = await refreshInFlight
        refreshInFlight = null
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch (refreshError) {
        refreshInFlight = null
        useAuthStore.getState().clear()
        if (window.location.pathname !== '/login') {
          window.location.assign('/login')
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

interface ApiErrorBody {
  message?: string | string[]
  error?: string
  statusCode?: number
}

/** Rút thông báo lỗi dễ đọc từ response của NestJS. */
export function apiErrorMessage(
  error: unknown,
  fallback = 'Đã có lỗi xảy ra, vui lòng thử lại',
): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join(', ') : body.message
    }
    if (error.response?.status === 0 || !error.response) {
      return 'Không kết nối được tới máy chủ'
    }
    if (error.message) {
      return error.message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
