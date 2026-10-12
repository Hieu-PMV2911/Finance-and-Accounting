import type { ComponentType } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  Landmark,
  LayoutDashboard,
  LogOut,
  UserCog,
  Users,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout as logoutApi } from '@/features/auth/auth.api'
import { cn } from '@/lib/utils'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import { ROLE_LABELS } from '@/types/api'

type IconType = ComponentType<{ className?: string }>

interface NavItem {
  to: string
  label: string
  icon: IconType
  end?: boolean
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Tài khoản kế toán', icon: BookOpen },
  { to: '/users', label: 'Người dùng', icon: Users, adminOnly: true },
  { to: '/profile', label: 'Hồ sơ của tôi', icon: UserCog },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )

export function Layout() {
  const user = useAuthStore((state) => state.user)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const clear = useAuthStore((state) => state.clear)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const items = NAV_ITEMS.filter(
    (item) => !item.adminOnly || hasRole(user, 'admin'),
  )

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await logoutApi(refreshToken)
      }
    } catch {
      // Bỏ qua lỗi mạng khi đăng xuất — vẫn xóa phiên cục bộ.
    }
    clear()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  const initials = user?.email?.charAt(0).toUpperCase() ?? '?'
  const roleText = user?.roles.map((role) => ROLE_LABELS[role]).join(', ') ?? ''

  return (
    <div className="bg-muted/30 flex min-h-screen">
      <aside className="bg-sidebar hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <Landmark className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Accounting Ledger</p>
            <p className="text-muted-foreground text-xs">Sổ cái kế toán kép</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="text-muted-foreground border-t p-4 text-xs">
          API: <code className="text-foreground">/api</code> · Swagger{' '}
          <code className="text-foreground">/api/docs</code>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg md:hidden">
            <Landmark className="size-4" />
          </div>

          <div className="min-w-0 md:hidden">
            <p className="truncate text-sm font-semibold">Accounting Ledger</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left sm:block">
                    <p className="max-w-[180px] truncate text-sm font-medium">
                      {user?.email ?? 'Người dùng'}
                    </p>
                    <p className="text-muted-foreground text-xs">{roleText}</p>
                  </div>
                  <ChevronDown className="text-muted-foreground size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user?.email}</p>
                  <p className="text-muted-foreground text-xs">{roleText}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserCog />
                  Hồ sơ của tôi
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                  <LogOut />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="bg-background overflow-x-auto border-b px-3 py-2 md:hidden">
          <div className="flex items-center gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
