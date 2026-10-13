import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  CalendarRange,
  ListChecks,
  LoaderCircle,
  Lock,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import {
  FISCAL_PERIOD_STATUSES,
  FISCAL_PERIOD_STATUS_LABELS,
  type FiscalPeriod,
  type FiscalPeriodFilters,
  type FiscalPeriodStatus,
} from '@/types/api'
import { FiscalPeriodFormModal } from './FiscalPeriodFormModal'
import { PeriodBalancesDialog } from './PeriodBalancesDialog'
import {
  closeFiscalPeriod,
  deleteFiscalPeriod,
  listFiscalPeriods,
  lockFiscalPeriod,
  openFiscalPeriod,
} from './periods.api'

const ALL = '__all__'

const STATUS_BADGE: Record<FiscalPeriodStatus, string> = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  locked: 'border-amber-200 bg-amber-50 text-amber-700',
  closed: 'border-zinc-300 bg-zinc-100 text-zinc-700',
}

const STATUS_ICON: Record<FiscalPeriodStatus, typeof Lock> = {
  open: Unlock,
  locked: Lock,
  closed: LockKeyhole,
}

type TransitionAction = 'lock' | 'close'

const TRANSITION_META: Record<
  TransitionAction,
  { title: string; confirmLabel: string; description: (period: FiscalPeriod) => string }
> = {
  lock: {
    title: 'Tạm khóa kỳ kế toán',
    confirmLabel: 'Tạm khóa',
    description: (period) =>
      `Kỳ ${period.code} sẽ bị đóng băng: không thể lập, sửa, xóa hay ghi sổ bút toán nào thuộc kỳ này. Bạn vẫn có thể mở lại sau.`,
  },
  close: {
    title: 'Chốt kỳ kế toán',
    confirmLabel: 'Chốt kỳ',
    description: (period) =>
      `Kỳ ${period.code} sẽ được chốt VĨNH VIỄN — không thể mở lại — và số dư cuối kỳ được kết chuyển thành số dư đầu kỳ của kỳ kế tiếp.`,
  },
}

export function FiscalPeriodsPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')
  const canManage = isAdmin || hasRole(user, 'poster')
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FiscalPeriodStatus | ''>('')
  const [yearFilter, setYearFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FiscalPeriod | null>(null)
  const [balancesTarget, setBalancesTarget] = useState<FiscalPeriod | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FiscalPeriod | null>(null)
  const [transitionTarget, setTransitionTarget] = useState<{
    period: FiscalPeriod
    action: TransitionAction
  } | null>(null)

  const parsedYear = Number.parseInt(yearFilter, 10)
  const filters: FiscalPeriodFilters = {
    search: search || undefined,
    status: statusFilter || undefined,
    year: Number.isFinite(parsedYear) ? parsedYear : undefined,
  }

  const periodsQuery = useQuery({
    queryKey: ['fiscal-periods', 'list', filters],
    queryFn: () => listFiscalPeriods(filters),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFiscalPeriod(id),
    onSuccess: () => {
      toast.success('Đã xóa kỳ kế toán')
      setDeleteTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Xóa thất bại')),
  })

  const transitionMutation = useMutation({
    mutationFn: ({
      period,
      action,
    }: {
      period: FiscalPeriod
      action: TransitionAction
    }) =>
      action === 'lock' ? lockFiscalPeriod(period.id) : closeFiscalPeriod(period.id),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.action === 'lock'
          ? `Đã tạm khóa kỳ ${variables.period.code}`
          : `Đã chốt kỳ ${variables.period.code} và kết chuyển số dư`,
      )
      setTransitionTarget(null)
      invalidate()
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'Chuyển trạng thái thất bại')),
  })

  const reopenMutation = useMutation({
    mutationFn: (period: FiscalPeriod) => openFiscalPeriod(period.id),
    onSuccess: (_data, period) => {
      toast.success(`Đã mở lại kỳ ${period.code}`)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Mở lại thất bại')),
  })

  const periods = periodsQuery.data ?? []
  const openCount = periods.filter((item) => item.status === 'open').length
  const lockedCount = periods.filter((item) => item.status === 'locked').length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Kỳ kế toán"
        description={`${periods.length} kỳ — ${openCount} đang mở, ${lockedCount} tạm khóa. Bút toán chỉ được ghi vào kỳ đang mở.`}
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus />
              Thêm kỳ
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Tìm theo mã hoặc tên kỳ…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          value={statusFilter || ALL}
          onValueChange={(value) =>
            setStatusFilter(
              value === ALL ? '' : (value as FiscalPeriodStatus),
            )
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {FISCAL_PERIOD_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {FISCAL_PERIOD_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="w-[130px]"
          type="number"
          inputMode="numeric"
          placeholder="Năm"
          value={yearFilter}
          onChange={(event) => setYearFilter(event.target.value)}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {periodsQuery.isLoading ? (
          <TableLoading cols={6} />
        ) : periodsQuery.isError ? (
          <ErrorState message={apiErrorMessage(periodsQuery.error)} />
        ) : periods.length === 0 ? (
          <EmptyState message="Chưa có kỳ kế toán nào phù hợp." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã kỳ</TableHead>
                <TableHead>Tên kỳ</TableHead>
                <TableHead>Khoảng thời gian</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Mốc trạng thái</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => {
                const StatusIcon = STATUS_ICON[period.status]
                const stamp =
                  period.status === 'closed'
                    ? period.closedAt
                    : period.status === 'locked'
                      ? period.lockedAt
                      : null

                return (
                  <TableRow key={period.id}>
                    <TableCell className="font-mono font-semibold">
                      {period.code}
                    </TableCell>
                    <TableCell>
                      {period.name}
                      {period.notes ? (
                        <p className="text-muted-foreground mt-0.5 max-w-[280px] truncate text-xs">
                          {period.notes}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(period.startDate)} → {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE[period.status]}
                      >
                        <StatusIcon />
                        {FISCAL_PERIOD_STATUS_LABELS[period.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(stamp)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal />
                            <span className="sr-only">Hành động</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setBalancesTarget(period)}
                          >
                            <ListChecks />
                            Xem số dư
                          </DropdownMenuItem>
                          {canManage && period.status === 'open' ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(period)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil />
                              Sửa kỳ
                            </DropdownMenuItem>
                          ) : null}
                          {canManage && period.status === 'open' ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setTransitionTarget({ period, action: 'lock' })
                              }
                            >
                              <Lock />
                              Tạm khóa kỳ
                            </DropdownMenuItem>
                          ) : null}
                          {canManage && period.status === 'locked' ? (
                            <DropdownMenuItem
                              disabled={reopenMutation.isPending}
                              onClick={() => reopenMutation.mutate(period)}
                            >
                              <Unlock />
                              Mở lại kỳ
                            </DropdownMenuItem>
                          ) : null}
                          {canManage && period.status !== 'closed' ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setTransitionTarget({ period, action: 'close' })
                              }
                            >
                              <Archive />
                              Chốt kỳ
                            </DropdownMenuItem>
                          ) : null}
                          {isAdmin && period.status === 'open' ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget(period)}
                              >
                                <Trash2 />
                                Xóa kỳ
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <FiscalPeriodFormModal
        key={`${formOpen ? 'open' : 'closed'}-${editing?.id ?? 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        period={editing}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          invalidate()
        }}
      />

      <PeriodBalancesDialog
        period={balancesTarget}
        onOpenChange={(open) => !open && setBalancesTarget(null)}
      />

      <Dialog
        open={Boolean(transitionTarget)}
        onOpenChange={(open) => !open && setTransitionTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {transitionTarget
                ? TRANSITION_META[transitionTarget.action].title
                : ''}
            </DialogTitle>
            <DialogDescription>
              {transitionTarget
                ? TRANSITION_META[transitionTarget.action].description(
                    transitionTarget.period,
                  )
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionTarget(null)}>
              Hủy
            </Button>
            <Button
              variant={
                transitionTarget?.action === 'close' ? 'destructive' : 'default'
              }
              disabled={transitionMutation.isPending}
              onClick={() =>
                transitionTarget && transitionMutation.mutate(transitionTarget)
              }
            >
              {transitionMutation.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Đang xử lý…
                </>
              ) : transitionTarget ? (
                TRANSITION_META[transitionTarget.action].confirmLabel
              ) : (
                ''
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa kỳ kế toán</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa kỳ{' '}
              <span className="text-foreground font-medium">
                {deleteTarget?.code} — {deleteTarget?.name}
              </span>
              ? Chỉ xóa được kỳ đang mở và chưa có bút toán nào.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              {deleteMutation.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Đang xóa…
                </>
              ) : (
                'Xóa'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {periods.length === 0 && !periodsQuery.isLoading ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <CalendarRange className="size-4" />
          Mẹo: tạo kỳ trước khi lập bút toán — ngày hạch toán phải nằm trong một kỳ.
        </div>
      ) : null}
    </div>
  )
}
