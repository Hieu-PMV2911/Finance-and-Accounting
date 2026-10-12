import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen, CheckCircle2, Layers, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { apiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from '@/types/api'
import { listAccounts } from '../accounts/accounts.api'

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
        description="Tình hình hệ thống tài khoản kế toán"
        action={
          <Button asChild variant="outline">
            <Link to="/accounts">
              Quản lý tài khoản
              <ArrowRight />
            </Link>
          </Button>
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
        </>
      )}
    </div>
  )
}
