import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  Layers,
  ScrollText,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { apiErrorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from '@/types/api'
import { listAccounts } from '../accounts/accounts.api'
import { listFiscalPeriods } from '../periods/periods.api'

const TYPE_BAR_COLORS: Record<AccountType, string> = {
  asset: 'bg-blue-500',
  liability: 'bg-amber-500',
  equity: 'bg-violet-500',
  revenue: 'bg-emerald-500',
  expense: 'bg-rose-500',
}

export function DashboardPage() {
  const accountsQuery = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => listAccounts(),
  })

  const openPeriodsQuery = useQuery({
    queryKey: ['fiscal-periods', 'open'],
    queryFn: () => listFiscalPeriods({ status: 'open' }),
  })
  const openPeriods = openPeriodsQuery.data ?? []

  const accounts = accountsQuery.data ?? []
  const total = accounts.length
  const active = accounts.filter((item) => item.isActive).length
  const postable = accounts.filter((item) => item.isPostable).length

  const byType = ACCOUNT_TYPES.map((type) => ({
    type,
    count: accounts.filter((item) => item.type === type).length,
  }))
  const maxCount = Math.max(1, ...byType.map((item) => item.count))

  const stats = [
    { label: 'Tổng tài khoản', value: total, icon: BookOpen },
    { label: 'Đang hoạt động', value: active, icon: CheckCircle2 },
    { label: 'Tài khoản lá (ghi sổ)', value: postable, icon: Wallet },
    { label: 'Tài khoản tổng hợp', value: total - postable, icon: Layers },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Tổng quan"
        description="Tình hình hệ thống tài khoản, kỳ kế toán và bút toán"
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/journals">
                <ScrollText />
                Sổ bút toán
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/accounts">
                Quản lý tài khoản
                <ArrowRight />
              </Link>
            </Button>
          </div>
        }
      />

      {accountsQuery.isLoading ? (
        <Card>
          <TableLoading rows={2} cols={4} />
        </Card>
      ) : accountsQuery.isError ? (
        <Card>
          <ErrorState message={apiErrorMessage(accountsQuery.error)} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="gap-0 py-5">
                <CardContent className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">
                      {stat.value}
                    </p>
                  </div>
                  <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                    <stat.icon className="size-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Phân bổ theo loại tài khoản</CardTitle>
              <CardDescription>
                Số lượng tài khoản trong từng nhóm (Tài sản, Nợ phải trả, Vốn,
                Doanh thu, Chi phí)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {byType.map((item) => (
                <div
                  key={item.type}
                  className="grid grid-cols-[120px_1fr_40px] items-center gap-4"
                >
                  <span className="text-sm">
                    {ACCOUNT_TYPE_LABELS[item.type]}
                  </span>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        TYPE_BAR_COLORS[item.type],
                      )}
                      style={{ width: `${(item.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-right text-sm font-semibold">
                    {item.count}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="size-4" />
                Kỳ kế toán đang mở
              </CardTitle>
              <CardDescription>
                Bút toán chỉ ghi sổ được vào kỳ đang mở. Chốt kỳ sẽ kết chuyển
                số dư cuối kỳ thành số dư đầu kỳ của kỳ kế tiếp.
              </CardDescription>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link to="/periods">
                    Quản lý kỳ
                    <ArrowRight />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {openPeriodsQuery.isLoading ? (
                <TableLoading rows={1} cols={3} />
              ) : openPeriodsQuery.isError ? (
                <ErrorState message={apiErrorMessage(openPeriodsQuery.error)} />
              ) : openPeriods.length === 0 ? (
                <EmptyState message="Chưa có kỳ kế toán nào đang mở." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {openPeriods.map((period) => (
                    <Badge
                      key={period.id}
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      {period.code} · {period.name} · {formatDate(period.startDate)} →{' '}
                      {formatDate(period.endDate)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
