import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Ban,
  CheckCircle2,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
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
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import {
  DOCUMENT_STATUSES,
  PAYMENT_DIRECTIONS,
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type DocumentStatus,
  type Payment,
  type PaymentDirection,
  type VoidDocumentPayload,
} from '@/types/api'
import { listAccounts } from '../accounts/accounts.api'
import { DocumentStatusBadge } from '../documents/DocumentStatusBadge'
import { VoidDocumentDialog } from '../documents/VoidDocumentDialog'
import { listParties } from '../parties/parties.api'
import { AllocationDialog } from './AllocationDialog'
import { PaymentFormModal } from './PaymentFormModal'
import {
  approvePayment,
  listPayments,
  postPayment,
  voidPayment,
} from './payments.api'

const ALL = '__all__'

type LifecycleAction = 'approve' | 'post'

/**
 * Phiếu thu / phiếu chi (mục 10.A).
 *
 * Phiếu chỉ **là lớp phân tích công nợ**: bút toán đã đúng ở mức tổng, còn
 * "khoản tiền này trả cho hóa đơn nào" nằm ở phân bổ — làm sau khi phiếu đã
 * ghi sổ. Vì vậy `Phân bổ` chỉ mở với phiếu `posted`.
 */
export function PaymentsPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')
  const canMake = isAdmin || hasRole(user, 'maker')
  const canCheck = isAdmin || hasRole(user, 'checker')
  const canPost = isAdmin || hasRole(user, 'poster')

  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState<PaymentDirection | ''>('')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [allocationTarget, setAllocationTarget] = useState<Payment | null>(null)
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)

  const partiesQuery = useQuery({
    queryKey: ['parties', { isActive: true }],
    queryFn: () => listParties({ isActive: true }),
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts', { isActive: true }],
    queryFn: () => listAccounts({ isActive: true }),
  })

  const paymentsQuery = useQuery({
    queryKey: [
      'payments',
      { direction: directionFilter, status: statusFilter, search },
    ],
    queryFn: () =>
      listPayments({
        direction: directionFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] })
    queryClient.invalidateQueries({ queryKey: ['payment-allocations'] })
    queryClient.invalidateQueries({ queryKey: ['aging'] })
  }

  const lifecycle = useMutation({
    mutationFn: ({
      action,
      id,
    }: {
      action: LifecycleAction
      id: string
    }): Promise<Payment> =>
      action === 'approve' ? approvePayment(id) : postPayment(id),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.action === 'approve'
          ? 'Đã xác nhận phiếu'
          : 'Đã ghi sổ phiếu và sinh bút toán',
      )
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Thao tác thất bại')),
  })

  const voidMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: VoidDocumentPayload
    }) => voidPayment(id, payload),
    onSuccess: () => {
      toast.success('Đã hủy phiếu')
      setVoidTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Hủy thất bại')),
  })

  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Số phiếu" />
        ),
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'direction',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Chiều" />
        ),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={
              row.original.direction === 'receipt'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }
          >
            {PAYMENT_DIRECTION_LABELS[row.original.direction]}
          </Badge>
        ),
      },
      {
        id: 'party',
        header: 'Đối tượng',
        cell: ({ row }) => {
          const party = row.original.party
          return party ? (
            <div className="grid">
              <span>{party.name}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {party.code}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        accessorKey: 'date',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Ngày" />
        ),
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Số tiền" />
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatMoney(row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: 'method',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Phương thức" />
        ),
        cell: ({ row }) => PAYMENT_METHOD_LABELS[row.original.method],
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Trạng thái" />
        ),
        cell: ({ row }) => (
          <DocumentStatusBadge status={row.original.status} />
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Hành động</div>,
        enableSorting: false,
        cell: ({ row }) => {
          const payment = row.original
          const editable = payment.status === 'draft' && canMake
          const approvable = payment.status === 'draft' && canCheck
          const postable = payment.status === 'approved' && canPost
          const allocatable = payment.status === 'posted' && canPost
          const voidable = payment.status !== 'voided' && canPost

          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal />
                    <span className="sr-only">Hành động</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {allocatable ? (
                    <DropdownMenuItem
                      onClick={() => setAllocationTarget(payment)}
                    >
                      <HandCoins /> Phân bổ công nợ
                    </DropdownMenuItem>
                  ) : null}
                  {editable ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(payment)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil /> Sửa
                    </DropdownMenuItem>
                  ) : null}
                  {approvable ? (
                    <DropdownMenuItem
                      onClick={() =>
                        lifecycle.mutate({ action: 'approve', id: payment.id })
                      }
                    >
                      <CheckCircle2 /> Xác nhận
                    </DropdownMenuItem>
                  ) : null}
                  {postable ? (
                    <DropdownMenuItem
                      onClick={() =>
                        lifecycle.mutate({ action: 'post', id: payment.id })
                      }
                    >
                      <Send /> Ghi sổ
                    </DropdownMenuItem>
                  ) : null}
                  {voidable ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setVoidTarget(payment)}
                      >
                        <Ban /> Hủy phiếu
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [canMake, canCheck, canPost, lifecycle],
  )

  const data = paymentsQuery.data ?? []
  const receipts = data.filter((item) => item.direction === 'receipt').length
  const disbursements = data.length - receipts

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Phiếu thu / phiếu chi"
        description={`Thanh toán theo đối tượng — ${data.length} phiếu (${receipts} thu, ${disbursements} chi). Ghi sổ sinh bút toán; phân bổ vào hóa đơn làm sau.`}
        action={
          canMake ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Lập phiếu
            </Button>
          ) : undefined
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Tìm theo số phiếu, diễn giải, tham chiếu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={directionFilter || ALL}
            onValueChange={(value) =>
              setDirectionFilter(
                value === ALL ? '' : (value as PaymentDirection),
              )
            }
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Chiều phiếu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi chiều</SelectItem>
              {PAYMENT_DIRECTIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {PAYMENT_DIRECTION_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter || ALL}
            onValueChange={(value) =>
              setStatusFilter(value === ALL ? '' : (value as DocumentStatus))
            }
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
              {DOCUMENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {PAYMENT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          {paymentsQuery.isLoading ? (
            <TableLoading cols={8} />
          ) : paymentsQuery.isError ? (
            <ErrorState message={apiErrorMessage(paymentsQuery.error)} />
          ) : data.length === 0 ? (
            <EmptyState message="Chưa có phiếu thu/chi nào khớp bộ lọc." />
          ) : (
            <DataTable columns={columns} data={data} />
          )}
        </div>
      </Card>

      {formOpen ? (
        <PaymentFormModal
          payment={editing}
          parties={partiesQuery.data ?? []}
          accounts={accountsQuery.data ?? []}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            setFormOpen(false)
            setEditing(null)
            invalidate()
          }}
        />
      ) : null}

      {allocationTarget ? (
        <AllocationDialog
          payment={allocationTarget}
          onClose={() => setAllocationTarget(null)}
        />
      ) : null}

      {voidTarget ? (
        <VoidDocumentDialog
          open
          onOpenChange={(open) => !open && setVoidTarget(null)}
          title={`Hủy phiếu ${voidTarget.code}`}
          loading={voidMutation.isPending}
          onConfirm={(payload) =>
            voidMutation.mutate({ id: voidTarget.id, payload })
          }
        />
      ) : null}
    </div>
  )
}
