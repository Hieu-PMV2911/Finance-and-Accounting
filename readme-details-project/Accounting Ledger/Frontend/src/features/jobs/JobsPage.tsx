import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Activity,
  FileBarChart,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
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
import { formatDateTime } from '@/lib/format'
import { hasRole, useAuthStore } from '@/stores/auth.store'
import {
  JOB_NAME_LABELS,
  JOB_QUEUE_LABELS,
  JOB_RUN_STATUSES,
  JOB_RUN_STATUS_LABELS,
  JOB_TRIGGER_LABELS,
  REPORT_FORMATS,
  REPORT_FORMAT_LABELS,
  REPORT_KINDS,
  REPORT_KIND_LABELS,
  type IntegrityViolation,
  type JobRun,
  type JobRunStatus,
  type JobQueueName,
  type ReportFormat,
  type ReportKind,
} from '@/types/api'
import { JobRunDetailDialog } from './JobRunDetailDialog'
import {
  enqueueReport,
  fetchJobsOverview,
  listJobRuns,
  listSchedules,
  runIntegrityCheck,
  triggerSchedule,
} from './jobs.api'
import { JOB_STATUS_BADGE, SEVERITY_BADGE, formatDuration } from './jobs-ui'

const ALL = '__all__'

/**
 * Xử lý bất đồng bộ (mục 9).
 *
 * Ba phần:
 * - **Hàng đợi & lượt chạy**: số job đang chờ/đang chạy/lỗi của 4 hàng đợi BullMQ
 *   + lịch sử từng lượt chạy, kèm xếp job sinh báo cáo nền và thử lại job lỗi.
 * - **Lịch định kỳ**: cron nào đang chạy, lần chạy gần nhất và lần kế tiếp; cho
 *   phép chạy ngay thay vì chờ tới mốc cron.
 * - **Kiểm tra bất biến**: chạy 7 kiểm tra của backend và xem danh sách vi phạm.
 */
export function JobsPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = hasRole(user, 'admin')
  const canOperate = isAdmin || hasRole(user, 'poster')

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Xử lý bất đồng bộ"
        description="Hàng đợi BullMQ, lịch chạy định kỳ và các job bảo trì: chốt số dư, kiểm tra bất biến, nhắc công nợ, sinh báo cáo nền."
      />

      <Tabs defaultValue="queues" className="gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="queues">Hàng đợi &amp; lượt chạy</TabsTrigger>
          <TabsTrigger value="schedules">Lịch định kỳ</TabsTrigger>
          <TabsTrigger value="integrity">Kiểm tra bất biến</TabsTrigger>
        </TabsList>

        <TabsContent value="queues">
          <QueuesTab canOperate={canOperate} />
        </TabsContent>

        <TabsContent value="schedules">
          <SchedulesTab canOperate={canOperate} />
        </TabsContent>

        <TabsContent value="integrity">
          <IntegrityTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ------------------------------------------------------------ hàng đợi

function QueuesTab({ canOperate }: { canOperate: boolean }) {
  const [queue, setQueue] = useState<JobQueueName | ''>('')
  const [status, setStatus] = useState<JobRunStatus | ''>('')
  const [detail, setDetail] = useState<JobRun | null>(null)

  const overviewQuery = useQuery({
    queryKey: ['jobs', 'overview'],
    queryFn: fetchJobsOverview,
    refetchInterval: 5000,
  })

  const filters = {
    queue: queue || undefined,
    status: status || undefined,
    limit: 50,
  }

  const runsQuery = useQuery({
    queryKey: ['jobs', 'runs', filters],
    queryFn: () => listJobRuns(filters),
    refetchInterval: 5000,
  })

  const runs = runsQuery.data ?? []

  const columns = useMemo<ColumnDef<JobRun>[]>(
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
        accessorKey: 'queue',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Hàng đợi" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">{JOB_QUEUE_LABELS[row.original.queue]}</Badge>
        ),
      },
      {
        accessorKey: 'jobName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Công việc" />
        ),
        cell: ({ row }) => (
          <span className="text-sm">
            {JOB_NAME_LABELS[row.original.jobName] ?? row.original.jobName}
          </span>
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
            className={JOB_STATUS_BADGE[row.original.status]}
          >
            {JOB_RUN_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        accessorKey: 'trigger',
        header: 'Kích hoạt',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {JOB_TRIGGER_LABELS[row.original.trigger]}
          </span>
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
        id: 'duration',
        header: 'Thời lượng',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatDuration(row.original.durationMs)}
          </span>
        ),
      },
    ],
    [],
  )

  const overview = overviewQuery.data

  return (
    <div className="flex flex-col gap-4">
      {overviewQuery.isError ? (
        <Card className="gap-0 py-0">
          <ErrorState message={apiErrorMessage(overviewQuery.error)} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(overview?.queues ?? []).map((item) => (
            <Card key={item.queue} className="gap-2">
              <CardHeader className="gap-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4" />
                  {item.label}
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  {item.queue}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Chờ" value={item.counts.waiting} />
                  <Stat label="Chạy" value={item.counts.active} />
                  <Stat label="Xong" value={item.counts.completed} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <Stat label="Lỗi" value={item.counts.failed} tone="danger" />
                  <Stat label="Hoãn" value={item.counts.delayed} />
                </div>
                {item.reachable ? null : (
                  <p className="text-rose-600 flex items-center gap-1 text-xs">
                    <TriangleAlert className="size-3.5" />
                    Không kết nối được Redis
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {overviewQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="gap-2">
                  <CardHeader>
                    <CardTitle className="text-base">…</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TableLoading rows={2} cols={2} />
                  </CardContent>
                </Card>
              ))
            : null}
        </div>
      )}

      {overview && !overview.schedulingEnabled ? (
        <Card className="border-amber-200 gap-0 py-0">
          <CardContent className="text-amber-700 flex items-center gap-2 p-4 text-sm">
            <TriangleAlert className="size-4" />
            Lịch định kỳ đang tắt (<code>JOBS_SCHEDULER_ENABLED=false</code>) — job
            chỉ chạy khi bấm tay.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Đang chờ" value={overview?.runs.pending ?? 0} />
        <StatCard label="Đang chạy" value={overview?.runs.active ?? 0} />
        <StatCard label="Hoàn thành" value={overview?.runs.completed ?? 0} />
        <StatCard label="Thất bại" value={overview?.runs.failed ?? 0} tone="danger" />
      </div>

      <ReportsEnqueueCard />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={queue || ALL}
          onValueChange={(value) =>
            setQueue(value === ALL ? '' : (value as JobQueueName))
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Hàng đợi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả hàng đợi</SelectItem>
            {(Object.keys(JOB_QUEUE_LABELS) as JobQueueName[]).map((item) => (
              <SelectItem key={item} value={item}>
                {JOB_QUEUE_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status || ALL}
          onValueChange={(value) =>
            setStatus(value === ALL ? '' : (value as JobRunStatus))
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {JOB_RUN_STATUSES.map((item) => (
              <SelectItem key={item} value={item}>
                {JOB_RUN_STATUS_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => runsQuery.refetch()}
          disabled={runsQuery.isFetching}
        >
          <RefreshCw className={runsQuery.isFetching ? 'animate-spin' : undefined} />
          Làm mới
        </Button>

        <span className="text-muted-foreground text-xs">
          Tự động cập nhật mỗi 5 giây.
        </span>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {runsQuery.isLoading ? (
          <TableLoading cols={7} />
        ) : runsQuery.isError ? (
          <ErrorState message={apiErrorMessage(runsQuery.error)} />
        ) : runs.length === 0 ? (
          <EmptyState message="Chưa có lượt chạy nào phù hợp. Hãy xếp một job sinh báo cáo hoặc chờ tới mốc cron." />
        ) : (
          <DataTable
            columns={columns}
            data={runs}
            onRowClick={(run) => setDetail(run)}
            hidePaginationWhenSinglePage={runs.length <= 10}
          />
        )}
      </Card>

      <JobRunDetailDialog
        run={detail}
        canOperate={canOperate}
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </div>
  )
}

/** Xếp job "sinh báo cáo nặng" ở chế độ nền. */
function ReportsEnqueueCard() {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ReportKind>('profit-and-loss')
  const [format, setFormat] = useState<ReportFormat | 'none'>('none')

  const mutation = useMutation({
    mutationFn: () =>
      enqueueReport({
        kind,
        format: format === 'none' ? undefined : format,
      }),
    onSuccess: (run) => {
      toast.success(`Đã xếp job sinh báo cáo (${run.id.slice(0, 8)}…)`)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Không xếp được job')),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileBarChart className="size-4" />
          Sinh báo cáo ở chế độ nền
        </CardTitle>
        <CardDescription>
          Báo cáo nặng (đặc biệt khi xuất Excel/PDF) chạy trong hàng đợi thay vì
          chặn request. Chọn định dạng để job sinh file rồi báo lại khi xong.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <Select value={kind} onValueChange={(value) => setKind(value as ReportKind)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {REPORT_KIND_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={format}
          onValueChange={(value) => setFormat(value as ReportFormat | 'none')}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Chỉ tính số liệu</SelectItem>
            {REPORT_FORMATS.map((item) => (
              <SelectItem key={item} value={item}>
                {REPORT_FORMAT_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Play />
          )}
          Xếp job
        </Button>
      </CardContent>
    </Card>
  )
}

// -------------------------------------------------------- lịch định kỳ

function SchedulesTab({ canOperate }: { canOperate: boolean }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['jobs', 'schedules'],
    queryFn: listSchedules,
  })

  const mutation = useMutation({
    mutationFn: (name: string) => triggerSchedule(name),
    onSuccess: (run, name) => {
      toast.success(`Đã chạy "${name}" — lượt ${run.id.slice(0, 8)}…`)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Chạy lịch thất bại')),
  })

  if (query.isLoading) {
    return (
      <Card>
        <TableLoading rows={4} cols={4} />
      </Card>
    )
  }

  if (query.isError) {
    return (
      <Card className="gap-0 py-0">
        <ErrorState message={apiErrorMessage(query.error)} />
      </Card>
    )
  }

  const schedules = query.data ?? []

  return (
    <div className="flex flex-col gap-3">
      {schedules.map((schedule) => (
        <Card key={schedule.name}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {schedule.label}
              <Badge variant="outline" className="font-mono">
                {schedule.cron}
              </Badge>
            </CardTitle>
            <CardDescription>{schedule.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Lần chạy gần nhất"
                value={formatDateTime(schedule.lastRunAt)}
              />
              <Field
                label="Kết quả gần nhất"
                value={
                  schedule.lastStatus
                    ? JOB_RUN_STATUS_LABELS[schedule.lastStatus]
                    : '—'
                }
              />
              <Field label="Lần chạy kế tiếp" value={formatDateTime(schedule.nextRunAt)} />
            </div>

            <Button
              variant="outline"
              disabled={!canOperate || mutation.isPending}
              onClick={() => mutation.mutate(schedule.name)}
            >
              {mutation.isPending && mutation.variables === schedule.name ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Play />
              )}
              Chạy ngay
            </Button>
          </CardContent>
        </Card>
      ))}

      {canOperate ? null : (
        <p className="text-muted-foreground text-xs">
          Chỉ quản trị hoặc người ghi sổ mới chạy được lịch bằng tay.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------- kiểm tra bất biến

function IntegrityTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient()

  const latestQuery = useQuery({
    queryKey: ['jobs', 'runs', { jobName: 'integrity-check', limit: 1 }],
    queryFn: () => listJobRuns({ jobName: 'integrity-check', limit: 1 }),
    refetchInterval: 5000,
  })

  const mutation = useMutation({
    mutationFn: () => runIntegrityCheck(),
    onSuccess: (run) => {
      toast.success(`Đã xếp kiểm tra bất biến (${run.id.slice(0, 8)}…)`)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'Không chạy được kiểm tra')),
  })

  const latest = latestQuery.data?.[0] ?? null
  const result = latest?.result ?? null
  const violations = Array.isArray(result?.violations)
    ? (result.violations as IntegrityViolation[])
    : []

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Chạy kiểm tra bất biến
          </CardTitle>
          <CardDescription>
            Bảy kiểm tra: Σ Nợ = Σ Có, số dư tái lập được từ bút toán, kỳ đã
            khóa/chốt, dòng định khoản mồ côi, số tiền sai quy tắc, ghi vào tài
            khoản cha, số hiệu bút toán trùng. Có vi phạm sẽ sinh cảnh báo và phát
            webhook cho quản trị.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isAdmin || mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Play />
            )}
            Chạy ngay
          </Button>
          {isAdmin ? null : (
            <p className="text-muted-foreground mt-2 text-xs">
              Chỉ quản trị mới chạy được kiểm tra bất biến.
            </p>
          )}
        </CardContent>
      </Card>

      {latestQuery.isLoading ? (
        <Card>
          <TableLoading rows={3} cols={3} />
        </Card>
      ) : latestQuery.isError ? (
        <Card className="gap-0 py-0">
          <ErrorState message={apiErrorMessage(latestQuery.error)} />
        </Card>
      ) : !latest ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Chưa có lần kiểm tra bất biến nào. Bấm 'Chạy ngay' hoặc chờ lịch 02:30 hằng ngày." />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard
              label="Vi phạm"
              value={Number(result?.violationCount ?? 0)}
              tone={Number(result?.violationCount ?? 0) > 0 ? 'danger' : 'ok'}
            />
            <StatCard label="Bút toán đã kiểm" value={Number(result?.checkedJournals ?? 0)} />
            <StatCard label="Lượt kiểm tra" value={Number(result?.checksRun ?? 0)} />
            <StatCard
              label="Kết luận"
              value={result?.passed ? 'Đạt' : 'Có vi phạm'}
              tone={result?.passed ? 'ok' : 'danger'}
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Lần chạy gần nhất: {formatDateTime(latest.createdAt)} · trạng thái{' '}
            {JOB_RUN_STATUS_LABELS[latest.status]}
            {latest.error ? ` · lỗi: ${latest.error}` : ''}
          </p>

          <Card className="gap-0 overflow-hidden py-0">
            {violations.length === 0 ? (
              <EmptyState message="Không phát hiện vi phạm bất biến nào — dữ liệu kế toán đang nhất quán." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Mức độ</TableHead>
                    <TableHead className="w-[220px]">Mã kiểm tra</TableHead>
                    <TableHead className="w-[220px]">Đối tượng</TableHead>
                    <TableHead>Mô tả</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {violations.map((violation) => (
                    <TableRow key={`${violation.code}-${violation.reference}`}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={SEVERITY_BADGE[violation.severity]}
                        >
                          {violation.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {violation.code}
                      </TableCell>
                      <TableCell className="text-sm">{violation.reference}</TableCell>
                      <TableCell className="text-sm">{violation.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ bits

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'danger'
}) {
  return (
    <div className="bg-muted/40 rounded-md px-2 py-1.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
          tone === 'danger' && value > 0 ? 'text-rose-600' : ''
        }`}
      >
        {value}
      </p>
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
  tone?: 'danger' | 'ok'
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`mt-1 text-lg font-semibold tabular-nums ${
            tone === 'danger'
              ? 'text-rose-600'
              : tone === 'ok'
                ? 'text-emerald-600'
                : ''
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  )
}
