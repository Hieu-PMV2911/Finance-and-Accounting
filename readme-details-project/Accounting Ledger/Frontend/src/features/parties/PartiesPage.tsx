import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { LoaderCircle, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
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
import { apiErrorMessage } from '@/lib/api'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import {
  PARTY_TYPES,
  PARTY_TYPE_LABELS,
  type Party,
  type PartyFilters,
  type PartyType,
} from '@/types/api'
import { deleteParty, listParties } from './parties.api'
import { PartyFormModal } from './PartyFormModal'

type StatusFilter = 'all' | 'active' | 'inactive'

const ALL = '__all__'

export function PartiesPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<PartyType | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Party | null>(null)

  const filters: PartyFilters = {
    search: search || undefined,
    type: typeFilter || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
  }

  const partiesQuery = useQuery({
    queryKey: ['parties', filters],
    queryFn: () => listParties(filters),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['parties'] })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParty(id),
    onSuccess: () => {
      toast.success('Đã xóa đối tượng')
      setDeleteTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Xóa thất bại')),
  })

  const openCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((party: Party) => {
    setEditing(party)
    setFormOpen(true)
  }, [])

  const handleSaved = () => {
    setFormOpen(false)
    setEditing(null)
    invalidate()
  }

  const columns = useMemo<ColumnDef<Party>[]>(() => [
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mã" />,
      cell: ({ row }) => <span className="font-mono font-semibold">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tên" />,
      cell: ({ row }) => row.original.name,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Loại" />,
      cell: ({ row }) => <Badge variant="outline">{PARTY_TYPE_LABELS[row.original.type]}</Badge>,
    },
    {
      accessorKey: 'contactPhone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Điện thoại" />,
      cell: ({ row }) => row.original.contactPhone || '—',
    },
    {
      accessorKey: 'taxCode',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mã số thuế" />,
      cell: ({ row }) => row.original.taxCode || '—',
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" />,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Đang hoạt động</Badge>
        ) : (
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Ngừng</Badge>
        ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Hành động</div>,
      enableSorting: false,
      cell: ({ row }) =>
        isAdmin ? (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal />
                  <span className="sr-only">Hành động</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEdit(row.original)}>
                  <Pencil /> Sửa
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 /> Xóa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="text-muted-foreground text-right">—</div>
        ),
    },
  ], [isAdmin, openEdit])

  const data = partiesQuery.data ?? []
  const total = data.length
  const activeCount = data.filter((p) => p.isActive).length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Đối tượng (Khách hàng / Nhà cung cấp)"
        description={`Quản lý danh mục đối tượng dùng cho sổ cái phụ — ${total} đối tượng, ${activeCount} đang hoạt động`}
        action={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus /> Thêm đối tượng
            </Button>
          ) : undefined
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Tìm theo mã, tên, mã số thuế, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={typeFilter || ALL}
            onValueChange={(v) => setTypeFilter(v === ALL ? '' : (v as PartyType))}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Loại đối tượng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả loại</SelectItem>
              {PARTY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {PARTY_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="active">Đang hoạt động</SelectItem>
              <SelectItem value="inactive">Ngừng</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          {partiesQuery.isLoading ? (
            <TableLoading />
          ) : partiesQuery.isError ? (
            <ErrorState message={apiErrorMessage(partiesQuery.error)} />
          ) : data.length === 0 ? (
            <EmptyState message="Chưa có đối tượng nào." />
          ) : (
            <DataTable columns={columns} data={data} />
          )}
        </div>
      </Card>

      <PartyFormModal
        key={`${formOpen ? 'open' : 'closed'}-${editing?.id ?? 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        party={editing}
        onSaved={handleSaved}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa đối tượng</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa đối tượng{' '}
              <span className="text-foreground font-medium">
                {deleteTarget?.code} — {deleteTarget?.name}
              </span>
              ? Đối tượng đã phát sinh bút toán sẽ không thể xóa — hãy chuyển sang ngừng hoạt động.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
