import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import {
  WEBHOOK_DELIVERY_STATUS_LABELS,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENT_STATUS_LABELS,
  WEBHOOK_EVENT_TYPES,
  type WebhookDelivery,
  type WebhookDeliveryStatus,
  type WebhookEndpoint,
  type WebhookEventType,
  type WebhookInboundEvent,
} from '@/types/api'
import { WebhookEndpointDialog } from './WebhookEndpointDialog'
import {
  deleteWebhookEndpoint,
  emitWebhookEvent,
  fetchWebhookStats,
  listWebhookDeliveries,
  listWebhookEndpoints,
  listWebhookEvents,
  retryWebhookDelivery,
} from './webhooks.api'
import { DELIVERY_STATUS_BADGE, EVENT_STATUS_BADGE, shortId } from '../jobs/jobs-ui'

const ALL = '__all__'

/**
 * Webhook (mục 9): endpoint, nhật ký giao có retry, và webhook nhận vào.
 *
 * Tab **Sự kiện nhận vào** là chỗ kiểm chứng hai tình huống khó của tích hợp:
 * cùng một sự kiện gửi lại được ghi nhận `duplicate` (bỏ qua, không áp dụng
 * lần hai) và sự kiện cũ tới sau sự kiện mới hơn của cùng đối tượng được ghi
 * nhận `late` (giữ vết, không ghi đè trạng thái mới).
 */
export function WebhooksPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Webhook"
        description="Đăng ký nơi nhận sự kiện, theo dõi từng lần giao (có retry theo backoff) và xem webhook nhận vào — kể cả trường hợp trùng lặp hoặc đến trễ."
      />

      <Tabs defaultValue="endpoints" className="gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="endpoints">Endpoint</TabsTrigger>
          <TabsTrigger value="deliveries">Nhật ký giao</TabsTrigger>
          <TabsTrigger value="events">Sự kiện nhận vào</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints">
          <EndpointsTab />
        </TabsContent>

        <TabsContent value="deliveries">
          <DeliveriesTab />
        </TabsContent>

        <TabsContent value="events">
          <InboundEventsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ------------------------------------------------------------------ endpoint

function EndpointsTab() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null)
  const [emitType, setEmitType] = useState<WebhookEventType>('ping')

  const endpointsQuery = useQuery({
    queryKey: ['webhooks', 'endpoints'],
    queryFn: listWebhookEndpoints,
  })

  const statsQuery = useQuery({
    queryKey: ['webhooks', 'stats'],
    queryFn: fetchWebhookStats,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
  }

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteWebhookEndpoint(id),
    onSuccess: () => {
      toast.success('Đã xóa endpoint')
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Xóa thất bại')),
  })

  const emitMutation = useMutation({
    mutationFn: () =>
      emitWebhookEvent({ eventType: emitType, resourceRef: 'manual-test' }),
    onSuccess: (deliveries) => {
      toast.success(
        deliveries.length === 0
          ? 'Không có endpoint nào đăng ký sự kiện này (hoặc đã giao trước đó)'
          : `Đã xếp ${deliveries.length} lần giao`,
      )
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Phát sự kiện thất bại')),
  })

  const columns = useMemo<ColumnDef<WebhookEndpoint>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tên" />
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'url',
        header: 'URL',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs break-all">
            {row.original.url}
          </span>
        ),
      },
      {
        id: 'events',
        header: 'Sự kiện',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.events.length === 0 ? (
            <Badge variant="secondary">Mọi sự kiện</Badge>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.events.map((item) => (
                <Badge key={item} variant="outline" className="text-xs">
                  {WEBHOOK_EVENT_LABELS[item]}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Trạng thái" />
        ),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={
              row.original.isActive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }
          >
            {row.original.isActive ? 'Đang hoạt động' : 'Đang tắt'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Sửa endpoint"
              onClick={() => {
                setEditing(row.original)
                setDialogOpen(true)
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-rose-600"
              aria-label="Xóa endpoint"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(row.original.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [removeMutation],
  )

  const endpoints = endpointsQuery.data ?? []
  const stats = statsQuery.data

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Endpoint hoạt động"
          value={`${stats?.activeEndpoints ?? 0}/${stats?.totalEndpoints ?? 0}`}
        />
        <StatCard label="Đang chờ giao" value={stats?.pendingDeliveries ?? 0} />
        <StatCard
          label="Giao thất bại"
          value={stats?.failedDeliveries ?? 0}
          tone={(stats?.failedDeliveries ?? 0) > 0 ? 'danger' : undefined}
        />
        <StatCard
          label="Sự kiện nhận vào"
          value={`${stats?.eventsReceived ?? 0} (trễ ${stats?.lateEvents ?? 0})`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="size-4" />
            Phát sự kiện thử
          </CardTitle>
          <CardDescription>
            Gửi một sự kiện ra mọi endpoint đăng ký để kiểm tra kết nối và chữ ký.
            Sự kiện đã giao thành công sẽ không bị gửi lại (chống giao trùng).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={emitType}
            onValueChange={(value) => setEmitType(value as WebhookEventType)}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBHOOK_EVENT_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {WEBHOOK_EVENT_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => emitMutation.mutate()}
            disabled={emitMutation.isPending}
          >
            {emitMutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Send />
            )}
            Phát sự kiện
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Hiển thị {endpoints.length} endpoint.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => endpointsQuery.refetch()}
            disabled={endpointsQuery.isFetching}
          >
            <RefreshCw
              className={endpointsQuery.isFetching ? 'animate-spin' : undefined}
            />
            Làm mới
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus />
            Thêm endpoint
          </Button>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {endpointsQuery.isLoading ? (
          <TableLoading cols={5} />
        ) : endpointsQuery.isError ? (
          <ErrorState message={apiErrorMessage(endpointsQuery.error)} />
        ) : endpoints.length === 0 ? (
          <EmptyState message="Chưa đăng ký endpoint nào. Thêm endpoint để nhận sự kiện từ hệ thống kế toán." />
        ) : (
          <DataTable
            columns={columns}
            data={endpoints}
            hidePaginationWhenSinglePage={endpoints.length <= 10}
          />
        )}
      </Card>

      <WebhookEndpointDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        endpoint={editing}
        onOpenChange={(open) => setDialogOpen(open)}
        onSaved={() => {
          setDialogOpen(false)
          invalidate()
        }}
      />
    </div>
  )
}

// --------------------------------------------------------------- nhật ký giao

function DeliveriesTab() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<WebhookDeliveryStatus | ''>('')

  const filters = { status: status || undefined, limit: 100 }

  const query = useQuery({
    queryKey: ['webhooks', 'deliveries', filters],
    queryFn: () => listWebhookDeliveries(filters),
    refetchInterval: 5000,
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryWebhookDelivery(id),
    onSuccess: () => {
      toast.success('Đã xếp lại lần giao webhook')
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Thử lại thất bại')),
  })

  const columns = useMemo<ColumnDef<WebhookDelivery>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tạo lúc" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'endpoint',
        header: 'Endpoint',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.original.endpointName ?? '—'}</p>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {row.original.endpointUrl ?? shortId(row.original.endpointId)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'eventType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Sự kiện" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-xs">
            {WEBHOOK_EVENT_LABELS[row.original.eventType]}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Trạng thái" />
        ),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={DELIVERY_STATUS_BADGE[row.original.status]}
          >
            {WEBHOOK_DELIVERY_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'attempts',
        header: 'Lần thử',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.attempts}/{row.original.maxAttempts}
          </span>
        ),
      },
      {
        id: 'response',
        header: 'Phản hồi',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-sm tabular-nums">
              {row.original.responseStatus ?? '—'}
            </p>
            {row.original.lastError ? (
              <p className="text-rose-600 max-w-[240px] truncate text-xs">
                {row.original.lastError}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'delivered' ? null : (
            <Button
              variant="outline"
              size="sm"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate(row.original.id)}
            >
              <RotateCcw />
              Thử lại
            </Button>
          ),
      },
    ],
    [retryMutation],
  )

  const deliveries = query.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status || ALL}
          onValueChange={(value) =>
            setStatus(value === ALL ? '' : (value as WebhookDeliveryStatus))
          }
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            <SelectItem value="pending">Đang chờ</SelectItem>
            <SelectItem value="delivered">Đã giao</SelectItem>
            <SelectItem value="failed">Thất bại</SelectItem>
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

        <span className="text-muted-foreground text-xs">
          Job giao webhook tự thử lại theo backoff; nút "Thử lại" dùng khi đã hết
          lượt thử.
        </span>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {query.isLoading ? (
          <TableLoading cols={7} />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : deliveries.length === 0 ? (
          <EmptyState message="Chưa có lần giao webhook nào. Phát một sự kiện thử ở tab Endpoint để kiểm tra." />
        ) : (
          <DataTable
            columns={columns}
            data={deliveries}
            hidePaginationWhenSinglePage={deliveries.length <= 10}
          />
        )}
      </Card>
    </div>
  )
}

// -------------------------------------------------------- sự kiện nhận vào

function InboundEventsTab() {
  const query = useQuery({
    queryKey: ['webhooks', 'events'],
    queryFn: () => listWebhookEvents(100),
    refetchInterval: 5000,
  })

  const columns = useMemo<ColumnDef<WebhookInboundEvent>[]>(
    () => [
      {
        accessorKey: 'receivedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nhận lúc" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDateTime(row.original.receivedAt)}
          </span>
        ),
      },
      {
        accessorKey: 'externalId',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Id sự kiện" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.externalId}</span>
        ),
      },
      {
        accessorKey: 'eventType',
        header: 'Loại sự kiện',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.eventType}</span>
        ),
      },
      {
        accessorKey: 'resourceRef',
        header: 'Đối tượng',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.resourceRef}</span>
        ),
      },
      {
        accessorKey: 'occurredAt',
        header: 'Xảy ra lúc',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDateTime(row.original.occurredAt)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Kết quả" />
        ),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={EVENT_STATUS_BADGE[row.original.status]}
          >
            {WEBHOOK_EVENT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'reason',
        header: 'Ghi chú',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground max-w-[260px] text-xs">
            {row.original.reason ?? '—'}
          </span>
        ),
      },
    ],
    [],
  )

  const events = query.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoint nhận webhook vào</CardTitle>
          <CardDescription>
            <code className="font-mono text-xs">POST /api/webhooks/inbound</code> —
            envelope bắt buộc{' '}
            <code className="font-mono text-xs">
              {'{ id, eventType, resourceRef, occurredAt, data }'}
            </code>
            . Cấu hình <code className="font-mono text-xs">WEBHOOK_INBOUND_SECRET</code>{' '}
            để bắt buộc xác thực chữ ký.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          Hiển thị {events.length} sự kiện đã nhận.
        </p>
        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} />
          Làm mới
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {query.isLoading ? (
          <TableLoading cols={7} />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : events.length === 0 ? (
          <EmptyState message="Chưa nhận webhook nào từ hệ thống ngoài." />
        ) : (
          <DataTable
            columns={columns}
            data={events}
            hidePaginationWhenSinglePage={events.length <= 10}
          />
        )}
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'danger'
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`mt-1 text-lg font-semibold tabular-nums ${
            tone === 'danger' ? 'text-rose-600' : ''
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
