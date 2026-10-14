import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  CheckCheck,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_SEVERITY_LABELS,
  NOTIFICATION_TYPE_LABELS,
  type AppNotification,
  type AppNotificationSeverity,
} from '@/types/api'
import { SEVERITY_BADGE } from '../jobs/jobs-ui'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.api'

const ALL = '__all__'

/**
 * Thông báo (mục 9).
 *
 * Đây là đầu ra của mọi job nền: nhắc công nợ (131/331), báo cáo sinh xong, cảnh
 * báo vi phạm bất biến. Phạm vi hiển thị do backend lọc theo người nhận và vai
 * trò, nên trang này không cần tự lọc quyền.
 */
export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'unread' | 'read' | ''>('unread')
  const [severity, setSeverity] = useState<AppNotificationSeverity | ''>('')

  const filters = {
    search: search || undefined,
    status: status || undefined,
    severity: severity || undefined,
    limit: 100,
  }

  const query = useQuery({
    queryKey: ['notifications', 'list', filters],
    queryFn: () => listNotifications(filters),
  })

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      toast.success('Đã đánh dấu đã đọc')
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Cập nhật thất bại')),
  })

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (updated) => {
      toast.success(`Đã đánh dấu ${updated} thông báo là đã đọc`)
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Cập nhật thất bại')),
  })

  const notifications = query.data ?? []
  const unread = notifications.filter((item) => item.status === 'unread').length

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Thông báo"
        description="Kết quả của các job nền: nhắc công nợ, báo cáo đã sinh xong và cảnh báo vi phạm bất biến."
        action={
          <Button
            variant="outline"
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending || unread === 0}
          >
            {readAllMutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CheckCheck />
            )}
            Đánh dấu tất cả đã đọc
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Tìm theo tiêu đề hoặc nội dung…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          value={status || ALL}
          onValueChange={(value) =>
            setStatus(value === ALL ? '' : (value as 'unread' | 'read'))
          }
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            <SelectItem value="unread">Chưa đọc</SelectItem>
            <SelectItem value="read">Đã đọc</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={severity || ALL}
          onValueChange={(value) =>
            setSeverity(
              value === ALL ? '' : (value as AppNotificationSeverity),
            )
          }
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Mức độ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi mức độ</SelectItem>
            {NOTIFICATION_SEVERITIES.map((item) => (
              <SelectItem key={item} value={item}>
                {NOTIFICATION_SEVERITY_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} />
          Làm mới
        </Button>
      </div>

      {query.isLoading ? (
        <Card>
          <TableLoading rows={4} cols={3} />
        </Card>
      ) : query.isError ? (
        <Card className="gap-0 py-0">
          <ErrorState message={apiErrorMessage(query.error)} />
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Không có thông báo nào phù hợp. Thông báo sinh ra từ job nhắc công nợ, sinh báo cáo và kiểm tra bất biến." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((item) => (
            <NotificationCard
              key={item.id}
              notification={item}
              onRead={() => readMutation.mutate(item.id)}
              pending={readMutation.isPending}
            />
          ))}
        </div>
      )}

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <BellRing className="size-3.5" />
        Hiển thị {notifications.length} thông báo · {unread} chưa đọc
      </p>
    </div>
  )
}

function NotificationCard({
  notification,
  onRead,
  pending,
}: {
  notification: AppNotification
  onRead: () => void
  pending: boolean
}) {
  const unread = notification.status === 'unread'

  return (
    <Card className={unread ? 'border-primary/40' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={SEVERITY_BADGE[notification.severity]}
            >
              {NOTIFICATION_SEVERITY_LABELS[notification.severity]}
            </Badge>
            <Badge variant="secondary">
              {NOTIFICATION_TYPE_LABELS[notification.type]}
            </Badge>
            {unread ? (
              <Badge className="bg-primary text-primary-foreground">Mới</Badge>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {formatDateTime(notification.createdAt)}
            </span>
          </div>

          <p className="mt-2 text-sm font-medium">{notification.title}</p>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            {notification.body}
          </p>
        </div>

        {unread ? (
          <Button variant="outline" size="sm" onClick={onRead} disabled={pending}>
            <CheckCheck />
            Đã đọc
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
