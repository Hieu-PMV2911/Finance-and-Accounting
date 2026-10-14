import { api } from '@/lib/api'
import type {
  BalanceSnapshotPayload,
  EnqueueReportPayload,
  JobRun,
  JobRunFilters,
  JobsOverview,
  QueueOverview,
  ScheduleView,
} from '@/types/api'

function cleanParams(filters: JobRunFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.queue) params.queue = filters.queue
  if (filters.status) params.status = filters.status
  if (filters.trigger) params.trigger = filters.trigger
  if (filters.jobName?.trim()) params.jobName = filters.jobName.trim()
  if (filters.limit !== undefined) params.limit = String(filters.limit)
  if (filters.offset !== undefined) params.offset = String(filters.offset)
  return params
}

/** Tình trạng hàng đợi + số lượt chạy theo trạng thái + cron có bật không. */
export async function fetchJobsOverview(): Promise<JobsOverview> {
  const { data } = await api.get<JobsOverview>('/jobs/overview')
  return data
}

export async function fetchQueues(): Promise<QueueOverview[]> {
  const { data } = await api.get<QueueOverview[]>('/jobs/queues')
  return data
}

export async function listJobRuns(filters: JobRunFilters = {}): Promise<JobRun[]> {
  const { data } = await api.get<JobRun[]>('/jobs/runs', {
    params: cleanParams(filters),
  })
  return data
}

export async function fetchJobRun(id: string): Promise<JobRun> {
  const { data } = await api.get<JobRun>(`/jobs/runs/${id}`)
  return data
}

/** Thử lại một job đã thất bại (tạo lượt chạy mới từ payload đã lưu). */
export async function retryJobRun(id: string): Promise<JobRun> {
  const { data } = await api.post<JobRun>(`/jobs/runs/${id}/retry`)
  return data
}

export async function listSchedules(): Promise<ScheduleView[]> {
  const { data } = await api.get<ScheduleView[]>('/jobs/schedules')
  return data
}

/** Chạy ngay một lịch định kỳ, không phải chờ tới mốc cron. */
export async function triggerSchedule(name: string): Promise<JobRun> {
  const { data } = await api.post<JobRun>(
    `/jobs/schedules/${encodeURIComponent(name)}/trigger`,
  )
  return data
}

/** Xếp job sinh báo cáo ở chế độ nền. */
export async function enqueueReport(payload: EnqueueReportPayload): Promise<JobRun> {
  const { data } = await api.post<JobRun>('/jobs/reports', payload)
  return data
}

/** Chạy kiểm tra bất biến ngay (chỉ admin). */
export async function runIntegrityCheck(periodId?: string): Promise<JobRun> {
  const { data } = await api.post<JobRun>('/jobs/integrity-checks', { periodId })
  return data
}

/** Chốt số dư một kỳ; `repair` mới ghi lại số dư, mặc định chỉ đối chiếu. */
export async function runBalanceSnapshot(
  payload: BalanceSnapshotPayload,
): Promise<JobRun> {
  const { data } = await api.post<JobRun>('/jobs/balance-snapshot', payload)
  return data
}

/**
 * Tải file báo cáo do job sinh ra.
 *
 * Endpoint yêu cầu Bearer token nên không dùng được `<a href>`; phải tải qua
 * axios dạng `blob` rồi kích hoạt tải xuống từ object URL. Trả về tên file đã lưu.
 */
export async function downloadJobReport(run: JobRun): Promise<string> {
  const filename =
    typeof run.result?.filename === 'string'
      ? run.result.filename
      : `bao-cao-${run.id.slice(0, 8)}`

  const { data } = await api.get<Blob>(`/jobs/runs/${run.id}/download`, {
    responseType: 'blob',
  })

  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return filename
}
