import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { ErrorState, LoadingState } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { ROLE_LABELS, type User } from '@/types/api'
import { changePassword } from '../auth/auth.api'
import { fetchProfile, updateProfile } from './profile.api'

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  )
}

/** Form chỉnh sửa hồ sơ — mount một lần với dữ liệu đã tải xong. */
function ProfileEditForm({ profile }: { profile: User }) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState(profile.fullName ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        fullName: fullName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      }),
    onSuccess: () => {
      setError(null)
      toast.success('Đã cập nhật hồ sơ')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (err) =>
      setError(apiErrorMessage(err, 'Cập nhật hồ sơ thất bại')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cập nhật hồ sơ</CardTitle>
        <CardDescription>Họ tên và ảnh đại diện của bạn</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="profile-name">Họ tên</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-avatar">Ảnh đại diện (URL)</Label>
            <Input
              id="profile-avatar"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>

          {avatarUrl.trim() ? (
            <Avatar className="size-16 border">
              <AvatarImage src={avatarUrl} alt="Ảnh đại diện" />
              <AvatarFallback>
                {profile.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : null}

          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Đang lưu…
                </>
              ) : (
                <>
                  <Save />
                  Lưu thay đổi
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setError(null)
      toast.success('Đã đổi mật khẩu, các phiên khác đã bị thu hồi')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err) => setError(apiErrorMessage(err, 'Đổi mật khẩu thất bại')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8) {
      setError('Mật khẩu mới tối thiểu 8 ký tự')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>
          Sau khi đổi, mọi phiên đăng nhập khác sẽ bị thu hồi
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Đang xử lý…
                </>
              ) : (
                'Đổi mật khẩu'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ProfilePage() {
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })

  if (profileQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState />
      </div>
    )
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <ErrorState message={apiErrorMessage(profileQuery.error)} />
      </div>
    )
  }

  const profile = profileQuery.data

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Hồ sơ của tôi"
        description="Thông tin cá nhân và bảo mật tài khoản"
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin tài khoản</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="size-12 border">
                <AvatarImage src={profile.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {profile.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {profile.fullName ?? (
                    <span className="text-muted-foreground">Chưa đặt họ tên</span>
                  )}
                </p>
                <p className="text-muted-foreground text-sm">{profile.email}</p>
              </div>
            </div>

            <Separator className="my-4" />

            <InfoRow label="Vai trò">
              <span className="flex flex-wrap justify-end gap-1">
                {profile.roles.map((role) => (
                  <Badge
                    key={role}
                    variant="outline"
                    className="border-blue-200 bg-blue-50 text-blue-700"
                  >
                    <ShieldCheck />
                    {ROLE_LABELS[role]}
                  </Badge>
                ))}
              </span>
            </InfoRow>
            <InfoRow label="Trạng thái">
              {profile.isActive ? (
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
            </InfoRow>
            <InfoRow label="Đăng nhập cuối">
              {formatDateTime(profile.lastLoginAt)}
            </InfoRow>
            <InfoRow label="Ngày tạo">
              {formatDateTime(profile.createdAt)}
            </InfoRow>
          </CardContent>
        </Card>

        <ProfileEditForm key={profile.id} profile={profile} />
        <PasswordForm />
      </div>
    </div>
  )
}
