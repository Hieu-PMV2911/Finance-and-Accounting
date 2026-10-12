import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Unlock,
} from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { ROLES, ROLE_LABELS, type Role, type User } from '@/types/api'
import { createUser, listUsers, resetUserPassword, updateUser } from './users.api'

const createSchema = z.object({
  email: z
    .string()
    .min(1, 'Vui lòng nhập email')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .max(72, 'Mật khẩu tối đa 72 ký tự'),
  fullName: z.string().max(255, 'Tối đa 255 ký tự'),
})

interface UserFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSaved: () => void
}

function UserFormModal({
  open,
  onOpenChange,
  user,
  onSaved,
}: UserFormModalProps) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [roles, setRoles] = useState<Role[]>(user?.roles ?? ['maker'])
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleRole = (role: Role) => {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    )
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (roles.length === 0) {
      setError('Chọn ít nhất một vai trò')
      return
    }

    setSaving(true)
    try {
      if (user) {
        await updateUser(user.id, {
          fullName: fullName.trim() || undefined,
          roles,
          isActive,
        })
        toast.success(`Đã cập nhật ${user.email}`)
      } else {
        const parsed = createSchema.safeParse({ email, password, fullName })
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
          return
        }
        await createUser({
          email: parsed.data.email.trim(),
          password: parsed.data.password,
          fullName: parsed.data.fullName.trim() || undefined,
          roles,
        })
        toast.success(`Đã tạo người dùng ${parsed.data.email.trim()}`)
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu người dùng thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {user ? 'Sửa người dùng' : 'Thêm người dùng'}
          </DialogTitle>
          <DialogDescription>
            Phân quyền theo vai trò kế toán: người lập, người duyệt, người ghi
            sổ hoặc quản trị.
          </DialogDescription>
        </DialogHeader>

        <form id="user-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="user-email">Email *</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              disabled={Boolean(user)}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ketoan@example.com"
            />
          </div>

          {user ? null : (
            <div className="grid gap-2">
              <Label htmlFor="user-password">Mật khẩu *</Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tối thiểu 8 ký tự"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="user-fullname">Họ tên</Label>
            <Input
              id="user-fullname"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="grid gap-2">
            <Label>Vai trò *</Label>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${role}`}
                    checked={roles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  <Label htmlFor={`role-${role}`} className="font-normal">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="user-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <Label htmlFor="user-active" className="font-normal">
                Đang hoạt động
              </Label>
            </div>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button type="submit" form="user-form" disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang lưu…
              </>
            ) : (
              'Lưu'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ResetPasswordModalProps {
  user: User | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

function ResetPasswordModal({
  user,
  onOpenChange,
  onDone,
}: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const mutation = useMutation({
    mutationFn: () => resetUserPassword(user!.id, newPassword),
    onSuccess: () => onDone(),
    onError: (err) =>
      setError(apiErrorMessage(err, 'Đặt lại mật khẩu thất bại')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError('Mật khẩu tối thiểu 8 ký tự')
      return
    }
    setSaving(true)
    mutation.mutate(undefined, { onSettled: () => setSaving(false) })
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          <DialogDescription>
            Đặt lại mật khẩu cho{' '}
            <span className="text-foreground font-medium">{user?.email}</span>.
            Mọi phiên đăng nhập hiện tại sẽ bị thu hồi.
          </DialogDescription>
        </DialogHeader>

        <form id="reset-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="reset-password">Mật khẩu mới *</Label>
            <Input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="reset-form" disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang lưu…
              </>
            ) : (
              'Đặt lại'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: listUsers })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateUser(id, { isActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản')
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Cập nhật thất bại')),
  })

  const handleSaved = () => {
    setFormOpen(false)
    setEditing(null)
    invalidate()
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Người dùng"
        description="Quản lý tài khoản và phân quyền theo vai trò kế toán"
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus />
            Thêm người dùng
          </Button>
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        {usersQuery.isLoading ? (
          <TableLoading />
        ) : usersQuery.isError ? (
          <ErrorState message={apiErrorMessage(usersQuery.error)} />
        ) : (usersQuery.data ?? []).length === 0 ? (
          <EmptyState message="Chưa có người dùng nào." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Họ tên</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Đăng nhập cuối</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.email}</TableCell>
                  <TableCell>
                    {item.fullName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-700"
                        >
                          <ShieldCheck />
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.isActive ? (
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
                        Đã khóa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(item.lastLoginAt)}
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
                          onClick={() => {
                            setEditing(item)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil />
                          Sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setResetTarget(item)}>
                          <KeyRound />
                          Đặt lại mật khẩu
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: item.id,
                              isActive: !item.isActive,
                            })
                          }
                        >
                          {item.isActive ? <Lock /> : <Unlock />}
                          {item.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <UserFormModal
        key={`${formOpen ? 'open' : 'closed'}-${editing?.id ?? 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        onSaved={handleSaved}
      />

      <ResetPasswordModal
        key={resetTarget?.id ?? 'none'}
        user={resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        onDone={() => {
          toast.success(`Đã đặt lại mật khẩu cho ${resetTarget?.email}`)
          setResetTarget(null)
        }}
      />
    </div>
  )
}
