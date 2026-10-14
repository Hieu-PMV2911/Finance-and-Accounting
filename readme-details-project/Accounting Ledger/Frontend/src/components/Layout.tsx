import type { ComponentType } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Bell,
  BookMarked,
  BookOpen,
  CalendarRange,
  ChevronRight,
  ChevronsUpDown,
  FileBarChart,
  Landmark,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  Webhook,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { logout as logoutApi } from '@/features/auth/auth.api'
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

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Kế toán',
    items: [
      { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
      { to: '/journals', label: 'Bút toán', icon: ScrollText },
      { to: '/periods', label: 'Kỳ kế toán', icon: CalendarRange },
      { to: '/ledger', label: 'Sổ cái', icon: BookMarked },
      { to: '/reports', label: 'Báo cáo tài chính', icon: FileBarChart },
    ],
  },
  {
    label: 'Danh mục',
    items: [{ to: '/accounts', label: 'Tài khoản kế toán', icon: BookOpen }],
  },
  {
    // Mục 9 — vận hành xử lý bất đồng bộ (hàng đợi, lịch định kỳ, thông báo, webhook).
    label: 'Vận hành',
    items: [
      { to: '/jobs', label: 'Xử lý bất đồng bộ', icon: Activity },
      { to: '/notifications', label: 'Thông báo', icon: Bell },
      { to: '/webhooks', label: 'Webhook', icon: Webhook, adminOnly: true },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { to: '/users', label: 'Người dùng', icon: Users, adminOnly: true },
      { to: '/audit', label: 'Kiểm toán', icon: ShieldCheck, adminOnly: true },
    ],
  },
]

/** Bỏ các mục chỉ dành cho admin khi người dùng hiện tại không phải admin. */
function useVisibleGroups() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')

  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0)
}

/** Mục menu đang mở, dùng để hiển thị tiêu đề trên thanh header. */
function currentTitle(pathname: string) {
  const all = NAV_GROUPS.flatMap((group) => group.items)
  const match = all.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  return match?.label ?? 'Accounting Ledger'
}

export function Layout() {
  const user = useAuthStore((state) => state.user)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const clear = useAuthStore((state) => state.clear)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const groups = useVisibleGroups()

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

  const isItemActive = (item: NavItem) =>
    item.end
      ? location.pathname === item.to
      : location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`)

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <NavLink to="/">
                  <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <Landmark className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      Accounting Ledger
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      Sổ cái kế toán kép
                    </span>
                  </div>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        isActive={isItemActive(item)}
                      >
                        <NavLink to={item.to} end={item.end}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="bg-primary/10 text-primary rounded-lg text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {user?.email ?? 'Người dùng'}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {roleText}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="top"
                  align="start"
                  sideOffset={4}
                >
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
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-muted/30">
        <header className="bg-background/95 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <div className="bg-border mx-1 h-4 w-px" />
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="text-muted-foreground hidden sm:inline">
              Accounting Ledger
            </span>
            <ChevronRight className="text-muted-foreground hidden size-3.5 sm:inline" />
            <span className="truncate font-medium">
              {currentTitle(location.pathname)}
            </span>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
