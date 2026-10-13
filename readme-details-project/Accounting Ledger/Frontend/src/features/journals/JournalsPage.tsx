import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  BadgeCheck,
  BookCheck,
  Eye,
  History,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Label } from '@/components/ui/label'
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
import { formatDate, formatMoney } from '@/lib/format'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import {
  JOURNAL_STATUSES,
  JOURNAL_STATUS_LABELS,
  type JournalEntry,
  type JournalFilters,
  type JournalStatus,
} from '@/types/api'
import { listFiscalPeriods } from '../periods/periods.api'
import { TraceJournalDialog } from '../audit/TraceJournalDialog'
import { JournalDetailDialog } from './JournalDetailDialog'
import { JournalFormModal } from './JournalFormModal'
import { ReverseJournalDialog } from './ReverseJournalDialog'
import {
  approveJournal,
  deleteJournal,
  listJournals,
  postJournal,
} from './journals.api'

const ALL = '__all__'

const STATUS_BADGE: Record<JournalStatus, string> = {
  draft: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  approved: 'border-blue-200 bg-blue-50 text-blue-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  reversed: 'border-rose-200 bg-rose-50 text-rose-700',
}

export function JournalsPage() {
  const user = useAuthStore((state) => state.user)
  const canMake = hasRole(user, 'admin') || hasRole(user, 'maker')
  const canApprove = hasRole(user, 'admin') || hasRole(user, 'checker')
  const canPost = hasRole(user, 'admin') || hasRole(user, 'poster')
  // Truy vết bút toán là chức năng kiểm toán — chỉ admin.
  const canTrace = hasRole(user, 'admin')
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<JournalStatus | ''>('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [traceTarget, setTraceTarget] = useState<JournalEntry | null>(null)

  const filters: JournalFilters = {
    search: search || undefined,
    status: statusFilter || undefined,
    periodId: periodFilter || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  }

  const journalsQuery = useQuery({
    queryKey: ['journals', 'list', filters],
    queryFn: () => listJournals(filters),
  })

  const periodsQuery = useQuery({
    queryKey: ['fiscal-periods', 'options'],
    queryFn: () => listFiscalPeriods(),
  })
  const periods = periodsQuery.data ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['journals'] })
    // Ghi sổ / đảo bút toán làm thay đổi số dư kỳ.
    queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] })
  }

  const approveMutation = useMutation({
    mutationFn: (entry: JournalEntry) => approveJournal(entry.id),
    onSuccess: (entry) => {
      toast.success(`Đã xác nhận bút toán ${entry.entryNo ?? entry.id.slice(0, 8)}`)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Xác nhận thất bại')),
  })

  const postMutation = useMutation({
    mutationFn: (entry: JournalEntry) => postJournal(entry.id),
    onSuccess: (entry) => {
      toast.success(
        `Đã ghi sổ ${entry.entryNo ?? ''} — số dư kỳ đã cập nhật`,
      )
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Ghi sổ thất bại')),
  })

  const deleteMutation = useMutation({
    mutationFn: (entry: JournalEntry) => deleteJournal(entry.id),
    onSuccess: () => {
      toast.success('Đã xóa bút toán nháp')
      setDeleteTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Xóa thất bại')),
  })

  const actionPending = approveMutation.isPending || postMutation.isPending
  const journals = journalsQuery.data ?? []
  const draftCount = journals.filter((item) => item.status === 'draft').length
  const postedCount = journals.filter((item) => item.status === 'posted').length

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Bút toán"
        description={`${journals.length} bút toán — ${draftCount} nháp, ${postedCount} đã ghi sổ. Mỗi bút toán phải cân bằng Nợ = Có.`}
        action={
          canMake ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus />
              Lập bút toán
            </Button>
          ) : undefined
        }
      />

      {!periodsQuery.isLoading && periods.length === 0 ? (
        <Alert>
          <AlertDescription>
            Chưa có kỳ kế toán nào — ngày hạch toán phải nằm trong một kỳ đang mở.{' '}
            <Link to="/periods" className="text-primary underline underline-offset-4">
              Tạo kỳ kế toán
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Tìm theo số hiệu, diễn giải hoặc chứng từ…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          value={statusFilter || ALL}
          onValueChange={(value) =>
            setStatusFilter(value === ALL ? '' : (value as JournalStatus))
          }
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {JOURNAL_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {JOURNAL_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={periodFilter || ALL}
          onValueChange={(value) => setPeriodFilter(value === ALL ? '' : value)}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Kỳ kế toán" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả kỳ</SelectItem>
            {periods.map((period) => (
              <SelectItem key={period.id} value={period.id}>
                {period.code} — {period.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            className="w-[150px]"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            className="w-[150px]"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {journalsQuery.isLoading ? (
          <TableLoading cols={7} />
        ) : journalsQuery.isError ? (
          <ErrorState message={apiErrorMessage(journalsQuery.error)} />
        ) : journals.length === 0 ? (
          <EmptyState message="Chưa có bút toán nào phù hợp." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số hiệu</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Diễn giải</TableHead>
                <TableHead>Kỳ</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journals.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.entryNo ? (
                      <span className="font-mono text-sm font-semibold">
                        {entry.entryNo}
                      </span>
                    ) : (
                      <Badge variant="secondary">Nháp</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(entry.date)}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="hover:text-primary max-w-[320px] truncate text-left text-sm"
                      onClick={() => setDetailId(entry.id)}
                    >
                      {entry.description}
                    </button>
                    {entry.reference ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        CT: {entry.reference}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {entry.period?.code ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(entry.totalDebit)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[entry.status]}>
                      {JOURNAL_STATUS_LABELS[entry.status]}
                    </Badge>
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
                        <DropdownMenuItem onClick={() => setDetailId(entry.id)}>
                          <Eye />
                          Xem chi tiết
                        </DropdownMenuItem>

                        {canTrace ? (
                          <DropdownMenuItem onClick={() => setTraceTarget(entry)}>
                            <History />
                            Truy vết
                          </DropdownMenuItem>
                        ) : null}

                        {canMake && entry.status === 'draft' ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(entry)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil />
                            Sửa nháp
                          </DropdownMenuItem>
                        ) : null}

                        {canApprove && entry.status === 'draft' ? (
                          <DropdownMenuItem
                            disabled={actionPending}
                            onClick={() => approveMutation.mutate(entry)}
                          >
                            <BadgeCheck />
                            Xác nhận
                          </DropdownMenuItem>
                        ) : null}

                        {canPost && entry.status === 'approved' ? (
                          <DropdownMenuItem
                            disabled={actionPending}
                            onClick={() => postMutation.mutate(entry)}
                          >
                            <BookCheck />
                            Ghi sổ
                          </DropdownMenuItem>
                        ) : null}

                        {canPost && entry.status === 'posted' ? (
                          <DropdownMenuItem
                            onClick={() => setReverseTarget(entry)}
                          >
                            <ArrowLeftRight />
                            Đảo bút toán
                          </DropdownMenuItem>
                        ) : null}

                        {canMake && entry.status === 'draft' ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(entry)}
                            >
                              <Trash2 />
                              Xóa nháp
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <JournalFormModal
        key={`${formOpen ? 'open' : 'closed'}-${editing?.id ?? 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editing}
        onSaved={() => {
          setFormOpen(false)
          setEditing(null)
          invalidate()
        }}
      />

      <JournalDetailDialog
        entryId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        canMake={canMake}
        canApprove={canApprove}
        canPost={canPost}
        actionPending={actionPending}
        onEdit={(entry) => {
          setDetailId(null)
          setEditing(entry)
          setFormOpen(true)
        }}
        onApprove={(entry) => approveMutation.mutate(entry)}
        onPost={(entry) => postMutation.mutate(entry)}
        onReverse={(entry) => {
          setDetailId(null)
          setReverseTarget(entry)
        }}
      />

      <ReverseJournalDialog
        key={reverseTarget?.id ?? 'none'}
        entry={reverseTarget}
        onOpenChange={(open) => !open && setReverseTarget(null)}
        onDone={(reversal) => {
          setReverseTarget(null)
          toast.success(
            `Đã tạo bút toán đảo ${reversal.entryNo ?? ''} và ghi sổ`,
          )
          invalidate()
        }}
      />

      <TraceJournalDialog
        entryId={traceTarget?.id ?? null}
        entryLabel={traceTarget?.entryNo ?? null}
        onOpenChange={(open) => !open && setTraceTarget(null)}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa bút toán nháp</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa bút toán nháp{' '}
              <span className="text-foreground font-medium">
                {deleteTarget?.description}
              </span>
              ? Chỉ bút toán nháp mới xóa được — bút toán đã ghi sổ phải dùng
              bút toán đảo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label className="text-muted-foreground text-xs">Số tiền</Label>
            <p className="font-mono text-sm">
              {formatMoney(deleteTarget?.totalDebit)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
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
    </div>
  )
}
