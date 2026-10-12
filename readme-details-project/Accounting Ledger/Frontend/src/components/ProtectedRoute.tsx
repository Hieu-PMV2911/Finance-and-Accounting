import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '../stores/auth.store'
import type { Role } from '../types/api'

interface ProtectedRouteProps {
  roles?: Role[]
}

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles?.length && !roles.some((role) => user?.roles.includes(role))) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
