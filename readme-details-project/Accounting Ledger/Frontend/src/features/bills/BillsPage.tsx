import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Ban,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
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
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
  type VendorBill,
  type VoidDocumentPayload,
} from '@/types/api'
import { DocumentDetailDialog } from '../documents/DocumentDetailDialog'
import { DocumentStatusBadge } from '../documents/DocumentStatusBadge'
import { VoidDocumentDialog } from '../documents/VoidDocumentDialog'
import { listParties } from '../parties/parties.api'
import {
  approveVendorBill,
  fetchVendorBill,
  listVendorBills,
  postVendorBill,
  voidVendorBill,
} from './bills.api'
import { BillFormModal } from './BillFormModal'

const ALL = '__all__'

type LifecycleAction = 'approve' | 'post'

/**
 * Hóa đơn mua (mục 10.A) — đối xứng hoàn toàn với hóa đơn bán:
 * `draft → approved → posted → voided`, ghi sổ mới sinh bút toán, hủy bản đã
 * ghi sổ sinh bút toán đảo.
 */
export function BillsPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')
  const canMake = isAdmin || hasRole(user, 'maker')
  const canCheck = isAdmin || hasRole(user, 'checker')
  const canPost = isAdmin || hasRole(user, 'poster')

  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('')
  const [partyFilter, setPartyFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VendorBill | null>(null)
  const [detailTarget, setDetailTarget] = useState<VendorBill | null>(null)
  const [voidTarget, setVoidTarget] = useState<VendorBill | null>(null)

  const partiesQuery = useQuery({
    queryKey: ['parties', { isActive: true }],
    queryFn: () => listParties({ isActive: true }),
  })
  const parties = partiesQuery.data ?? []

  const billsQuery = useQuery({
    queryKey: [
      'vendor-bills',
      { status: statusFilter, partyId: partyFilter, billNo: search },
    ],
    queryFn: () =>
      listVendorBills({
        status: statusFilter || undefined,
        partyId: partyFilter || undefined,
        billNo: search || undefined,
      }),
  })

  const detailQuery = useQuery({
    queryKey: ['vendor-bills', 'detail', detailTarget?.id],
    queryFn: () => fetchVendorBill(detailTarget!.id),
    enabled: Boolean(detailTarget),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vendor-bills'] })
    queryClient.invalidateQueries({ queryKey: ['aging'] })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
  }

  const lifecycle = useMutation({
    mutationFn: ({
      action,
      id,
    }: {
      action: LifecycleAction
      id: string
    }): Promise<VendorBill> =>
      action === 'approve' ? approveVendorBill(id) : postVendorBill(id),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.action === 'approve'
          ? 'Đã xác nhận hóa đơn mua'
          : 'Đã ghi sổ hóa đơn mua và sinh bút toán',
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
    }) => voidVendorBill(id, payload),
    onSuccess: () => {
      toast.success('Đã hủy hóa đơn mua')
      setVoidTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Hủy thất bại')),
  })

  const openEdit = async (bill: VendorBill) => {
    try {
      const detail = await fetchVendorBill(bill.id)
      setEditing(detail)
      setFormOpen(true)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Không tải được chi tiết hóa đơn mua'))
    }
  }

  const columns = useMemo<ColumnDef<VendorBill>[]>(
    () => [
      {
        accessorKey: 'billNo',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Số hóa đơn" />
        ),
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.billNo}</span>
        ),
      },
      {
        id: 'party',
        header: 'Nhà cung cấp',
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
        accessorKey: 'dueDate',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Đến hạn" />
        ),
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        accessorKey: 'total',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tổng tiền" />
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatMoney(row.original.total)}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Trạng thái" />
        ),
        cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Hành động</div>,
        enableSorting: false,
        cell: ({ row }) => {
          const bill = row.original
          const editable = bill.status === 'draft' && canMake
          const approvable = bill.status === 'draft' && canCheck
          const postable = bill.status === 'approved' && canPost
          const voidable = bill.status !== 'voided' && canPost

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
                  <DropdownMenuItem onClick={() => setDetailTarget(bill)}>
                    <Eye /> Xem chi tiết
                  </DropdownMenuItem>
                  {editable ? (
                    <DropdownMenuItem onClick={() => void openEdit(bill)}>
                      <Pencil /> Sửa
                    </DropdownMenuItem>
                  ) : null}
                  {approvable ? (
                    <DropdownMenuItem
                      onClick={() =>
                        lifecycle.mutate({ action: 'approve', id: bill.id })
                      }
                    >
                      <CheckCircle2 /> Xác nhận
                    </DropdownMenuItem>
                  ) : null}
                  {postable ? (
                    <DropdownMenuItem
                      onClick={() =>
                        lifecycle.mutate({ action: 'post', id: bill.id })
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
                        onClick={() => setVoidTarget(bill)}
                      >
                        <Ban /> Hủy hóa đơn
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

  const data = billsQuery.data ?? []
  const detail = detailQuery.data ?? detailTarget

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Hóa đơn mua"
        description={`Chứng từ phải trả — ${data.length} hóa đơn. Nháp → xác nhận → ghi sổ; hủy hóa đơn đã ghi sổ sẽ sinh bút toán đảo.`}
        action={
          canMake ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Tạo hóa đơn mua
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
              placeholder="Tìm theo số hóa đơn mua…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

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
                  {DOCUMENT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={partyFilter || ALL}
            onValueChange={(value) => setPartyFilter(value === ALL ? '' : value)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Nhà cung cấp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả nhà cung cấp</SelectItem>
              {parties
                .filter((party) => party.type !== 'customer')
                .map((party) => (
                  <SelectItem key={party.id} value={party.id}>
                    {party.code} — {party.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          {billsQuery.isLoading ? (
            <TableLoading cols={7} />
          ) : billsQuery.isError ? (
            <ErrorState message={apiErrorMessage(billsQuery.error)} />
          ) : data.length === 0 ? (
            <EmptyState message="Chưa có hóa đơn mua nào khớp bộ lọc." />
          ) : (
            <DataTable columns={columns} data={data} />
          )}
        </div>
      </Card>

      {formOpen ? (
        <BillFormModal
          bill={editing}
          parties={parties}
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

      <DocumentDetailDialog
        open={Boolean(detailTarget)}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        title="Hóa đơn mua"
        code={detail?.billNo ?? ''}
        status={detail?.status ?? 'draft'}
        partyName={detail?.party?.name}
        date={detail?.date ?? ''}
        dueDate={detail?.dueDate}
        description={detail?.description}
        lines={detail?.lines}
        subtotal={detail?.subtotal ?? '0'}
        taxAmount={detail?.taxAmount ?? '0'}
        total={detail?.total ?? '0'}
        journalEntryId={detail?.journalEntryId}
        reversalJournalEntryId={detail?.reversalJournalEntryId}
        voidReason={detail?.voidReason}
        loading={detailQuery.isFetching}
      />

      {voidTarget ? (
        <VoidDocumentDialog
          open
          onOpenChange={(open) => !open && setVoidTarget(null)}
          title={`Hủy hóa đơn mua ${voidTarget.billNo}`}
          loading={voidMutation.isPending}
          onConfirm={(payload) =>
            voidMutation.mutate({ id: voidTarget.id, payload })
          }
        />
      ) : null}
    </div>
  )
}
