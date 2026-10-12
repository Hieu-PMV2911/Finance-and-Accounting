import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CornerDownRight,
  ListTree,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Table as TableIcon,
  Trash2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiErrorMessage } from '@/lib/api'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type AccountFilters,
  type AccountLike,
  type AccountNode,
  type AccountType,
} from '@/types/api'
import { deleteAccount, fetchAccountTree, listAccounts } from './accounts.api'
import { AccountFormModal } from './AccountFormModal'

type ViewMode = 'tree' | 'table'
type StatusFilter = 'all' | 'active' | 'inactive'

const ALL = '__all__'

const TYPE_BADGE: Record<AccountType, string> = {
  asset: 'border-blue-200 bg-blue-50 text-blue-700',
  liability: 'border-amber-200 bg-amber-50 text-amber-700',
  equity: 'border-violet-200 bg-violet-50 text-violet-700',
  revenue: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expense: 'border-rose-200 bg-rose-50 text-rose-700',
}

/** Giữ lại nút khớp điều kiện và tổ tiên của nó. */
function filterTree(
  nodes: AccountNode[],
  match: (node: AccountNode) => boolean,
): AccountNode[] {
  const result: AccountNode[] = []
  for (const node of nodes) {
    const children = filterTree(node.children, match)
    if (match(node) || children.length > 0) {
      result.push({ ...node, children })
    }
  }
  return result
}

function AccountActions({
  account,
  onAddChild,
  onEdit,
  onDelete,
}: {
  account: AccountLike
  onAddChild: (account: AccountLike) => void
  onEdit: (account: AccountLike) => void
  onDelete: (account: AccountLike) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal />
          <span className="sr-only">Hành động</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAddChild(account)}>
          <CornerDownRight />
          Thêm tài khoản con
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(account)}>
          <Pencil />
          Sửa
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(account)}
        >
          <Trash2 />
          Xóa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TreeRows({
  nodes,
  isAdmin,
  onAddChild,
  onEdit,
  onDelete,
}: {
  nodes: AccountNode[]
  isAdmin: boolean
  onAddChild: (account: AccountLike) => void
  onEdit: (account: AccountLike) => void
  onDelete: (account: AccountLike) => void
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.id}>
          <TableRow>
            <TableCell>
              <span
                className="flex items-center gap-2"
                style={{ paddingLeft: (node.level - 1) * 20 }}
              >
                <span className="font-mono text-sm font-semibold">
                  {node.code}
                </span>
                <span className="text-muted-foreground text-sm">
                  {node.name}
                </span>
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={TYPE_BADGE[node.type]}>
                {ACCOUNT_TYPE_LABELS[node.type]}
              </Badge>
            </TableCell>
            <TableCell>
              {node.isPostable ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  Ghi sổ
                </Badge>
              ) : (
                <Badge variant="secondary">Tổng hợp</Badge>
              )}
            </TableCell>
            <TableCell>
              {node.isActive ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  Hoạt động
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-rose-200 bg-rose-50 text-rose-700"
                >
                  Ngừng
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              {isAdmin ? (
                <AccountActions
                  account={node}
                  onAddChild={onAddChild}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
          {node.children.length > 0 ? (
            <TreeRows
              nodes={node.children}
              isAdmin={isAdmin}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  )
}

export function AccountsPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')
  const queryClient = useQueryClient()

  const [view, setView] = useState<ViewMode>('tree')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<AccountType | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AccountLike | null>(null)
  const [presetParentId, setPresetParentId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AccountLike | null>(null)

  const filters: AccountFilters = {
    search: search || undefined,
    type: typeFilter || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
  }

  const allQuery = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => listAccounts(),
  })
  const listQuery = useQuery({
    queryKey: ['accounts', 'list', filters],
    queryFn: () => listAccounts(filters),
    enabled: view === 'table',
  })
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: fetchAccountTree,
    enabled: view === 'tree',
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['accounts'] })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => {
      toast.success('Đã xóa tài khoản')
      setDeleteTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Xóa thất bại')),
  })

  const filteredTree = useMemo(() => {
    const nodes = treeQuery.data ?? []
    if (!search.trim() && !typeFilter && statusFilter === 'all') {
      return nodes
    }
    const keyword = search.trim().toLowerCase()
    const match = (node: AccountNode) =>
      (!keyword ||
        node.code.toLowerCase().includes(keyword) ||
        node.name.toLowerCase().includes(keyword)) &&
      (!typeFilter || node.type === typeFilter) &&
      (statusFilter === 'all' ||
        (statusFilter === 'active' ? node.isActive : !node.isActive))
    return filterTree(nodes, match)
  }, [treeQuery.data, search, typeFilter, statusFilter])

  const openCreate = (parentId: string | null = null) => {
    setEditing(null)
    setPresetParentId(parentId)
    setFormOpen(true)
  }

  const openEdit = (account: AccountLike) => {
    setEditing(account)
    setPresetParentId(null)
    setFormOpen(true)
  }

  const handleSaved = () => {
    setFormOpen(false)
    setEditing(null)
    setPresetParentId(null)
    invalidate()
  }

  const total = allQuery.data?.length ?? 0
  const activeCount = allQuery.data?.filter((item) => item.isActive).length ?? 0

  const treeContent = treeQuery.isLoading ? (
    <TableLoading />
  ) : treeQuery.isError ? (
    <ErrorState message={apiErrorMessage(treeQuery.error)} />
  ) : filteredTree.length === 0 ? (
    <EmptyState message="Chưa có tài khoản nào phù hợp." />
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tài khoản</TableHead>
          <TableHead>Loại</TableHead>
          <TableHead>Ghi sổ</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead className="text-right">Hành động</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TreeRows
          nodes={filteredTree}
          isAdmin={isAdmin}
          onAddChild={(account) => openCreate(account.id)}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      </TableBody>
    </Table>
  )

  const tableContent = listQuery.isLoading ? (
    <TableLoading />
  ) : listQuery.isError ? (
    <ErrorState message={apiErrorMessage(listQuery.error)} />
  ) : (listQuery.data ?? []).length === 0 ? (
    <EmptyState message="Chưa có tài khoản nào phù hợp." />
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã</TableHead>
          <TableHead>Tên</TableHead>
          <TableHead>Loại</TableHead>
          <TableHead>Ghi sổ</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead className="text-right">Hành động</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(listQuery.data ?? []).map((account) => (
          <TableRow key={account.id}>
            <TableCell className="font-mono font-semibold">
              {account.code}
            </TableCell>
            <TableCell>{account.name}</TableCell>
            <TableCell>
              <Badge variant="outline" className={TYPE_BADGE[account.type]}>
                {ACCOUNT_TYPE_LABELS[account.type]}
              </Badge>
            </TableCell>
            <TableCell>
              {account.isPostable ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  Ghi sổ
                </Badge>
              ) : (
                <Badge variant="secondary">Tổng hợp</Badge>
              )}
            </TableCell>
            <TableCell>
              {account.isActive ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  Hoạt động
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-rose-200 bg-rose-50 text-rose-700"
                >
                  Ngừng
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              {isAdmin ? (
                <AccountActions
                  account={account}
                  onAddChild={(item) => openCreate(item.id)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Tài khoản kế toán"
        description={`Hệ thống tài khoản phân cấp — ${total} tài khoản, ${activeCount} đang hoạt động`}
        action={
          isAdmin ? (
            <Button onClick={() => openCreate(null)}>
              <Plus />
              Thêm tài khoản
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={view}
        onValueChange={(value) => setView(value as ViewMode)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Tìm theo mã hoặc tên…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Select
            value={typeFilter || ALL}
            onValueChange={(value) =>
              setTypeFilter(value === ALL ? '' : (value as AccountType))
            }
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Loại tài khoản" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả loại</SelectItem>
              {ACCOUNT_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ACCOUNT_TYPE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as StatusFilter)
            }
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="active">Đang hoạt động</SelectItem>
              <SelectItem value="inactive">Đã ngừng</SelectItem>
            </SelectContent>
          </Select>

          <TabsList className="ml-auto">
            <TabsTrigger value="tree">
              <ListTree />
              Cây
            </TabsTrigger>
            <TabsTrigger value="table">
              <TableIcon />
              Bảng
            </TabsTrigger>
          </TabsList>
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          <TabsContent value="tree" className="m-0">
            {treeContent}
          </TabsContent>
          <TabsContent value="table" className="m-0">
            {tableContent}
          </TabsContent>
        </Card>
      </Tabs>

      <AccountFormModal
        key={`${formOpen ? 'open' : 'closed'}-${editing?.id ?? presetParentId ?? 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        presetParentId={presetParentId}
        accounts={allQuery.data ?? []}
        onSaved={handleSaved}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa tài khoản</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa tài khoản{' '}
              <span className="text-foreground font-medium">
                {deleteTarget?.code} — {deleteTarget?.name}
              </span>
              ? Chỉ xóa được tài khoản lá không còn tài khoản con.
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
    </div>
  )
}
