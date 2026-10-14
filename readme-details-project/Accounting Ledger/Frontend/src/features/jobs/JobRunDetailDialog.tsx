import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import {
  JOB_NAME_LABELS,
  JOB_QUEUE_LABELS,
  JOB_RUN_STATUS_LABELS,
  JOB_TRIGGER_LABELS,
  type JobRun,
} from '@/types/api'
import { downloadJobReport, retryJobRun } from './jobs.api'
import { JOB_STATUS_BADGE, formatDuration } from './jobs-ui'

interface JobRunDetailDialogProps {
  run: JobRun | null
  onOpenChange: (open: boolean) => void
  /** Có quyền thử lại job thất bại (admin / poster). */
  canOperate: boolean
}

/**
 * Chi tiết một lượt chạy job: tham số đầu vào, kết quả, lỗi (nếu có) và các
 * thao tác khắc phục — **thử lại** job thất bại, **tải file** báo cáo đã sinh.
 *
 * Payload/kết quả là JSON thô nên được hiển thị nguyên văn trong `<pre>`: người
 * vận hành cần thấy đúng dữ liệu job nhận và trả, không phải bản đã làm đẹp.
 */
export function JobRunDetailDialog({
  run,
  onOpenChange,
  canOperate,
}: JobRunDetailDialogProps) {
  const queryClient = useQueryClient()
  const [downloading, setDownloading] = useState(false)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['jobs'] })
  }

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryJobRun(id),
    onSuccess: () => {
      toast.success('Đã xếp lượt chạy mới')
      invalidate()
      onOpenChange(false)
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Thử lại thất bại')),
  })

  const handleDownload = async () => {
    if (!run) return
    setDownloading(true)
    try {
      const filename = await downloadJobReport(run)
      toast.success(`Đã tải xuống ${filename}`)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Tải báo cáo thất bại'))
    } finally {
      setDownloading(false)
    }
  }

  const hasFile = typeof run?.result?.filename === 'string'

  return (
    <Dialog open={Boolean(run)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {run ? (
              <Badge variant="outline" className={JOB_STATUS_BADGE[run.status]}>
                {JOB_RUN_STATUS_LABELS[run.status]}
              </Badge>
            ) : null}
            <span>{run ? (JOB_NAME_LABELS[run.jobName] ?? run.jobName) : ''}</span>
          </DialogTitle>
          <DialogDescription>
            Hàng đợi &quot;{run ? JOB_QUEUE_LABELS[run.queue] : ''}&quot; · lượt chạy
            lưu bền trong `job_runs` nên vẫn xem được sau khi khởi động lại máy chủ.
          </DialogDescription>
        </DialogHeader>

        {run ? (
          <div className="max-h-[70vh] space-y-4 overflow-auto pr-1">
            <Card>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Mã lượt chạy" value={run.id} mono />
                <Field
                  label="Nguồn kích hoạt"
                  value={`${JOB_TRIGGER_LABELS[run.trigger]}${
                    run.triggeredByEmail ? ` · ${run.triggeredByEmail}` : ''
                  }`}
                />
                <Field label="Tạo lúc" value={formatDateTime(run.createdAt)} />
                <Field label="Bắt đầu" value={formatDateTime(run.startedAt)} />
                <Field label="Kết thúc" value={formatDateTime(run.finishedAt)} />
                <Field label="Thời lượng" value={formatDuration(run.durationMs)} />
                <Field
                  label="Số lần thử"
                  value={`${run.attempts}/${run.maxAttempts}`}
                />
                <Field label="Tiến độ" value={`${run.progress}%`} />
              </CardContent>
            </Card>

            {run.error ? (
              <Card className="border-rose-200">
                <CardHeader className="border-b border-rose-200">
                  <CardTitle className="text-base text-rose-700">
                    Lỗi của lần thử cuối
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs break-all whitespace-pre-wrap">
                    {run.error}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            <JsonCard title="Tham số đầu vào (payload)" value={run.payload} />
            <JsonCard title="Kết quả (result)" value={run.result} />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {hasFile ? (
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
              Tải file
            </Button>
          ) : null}
          {canOperate && run?.status === 'failed' ? (
            <Button
              onClick={() => retryMutation.mutate(run.id)}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RotateCcw />
              )}
              Thử lại
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JsonCard({
  title,
  value,
}: {
  title: string
  value: Record<string, unknown> | null
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <pre className="text-muted-foreground max-h-72 overflow-auto text-xs whitespace-pre-wrap">
          {value ? JSON.stringify(value, null, 2) : '—'}
        </pre>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
