import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditLog,
} from '@/types/api'
import { traceEntity } from './audit.api'
import { ACTION_BADGE, diffFields, renderFieldValue } from './audit-ui'

interface AuditLogDetailDialogProps {
  log: AuditLog | null
  onOpenChange: (open: boolean) => void
}

/**
 * Chi tiết một vết kiểm toán: ai làm gì, lúc nào, qua request nào, và **trước/sau**
 * ra sao. Kèm luôn **lịch sử của bản ghi** (`trace`) để thấy toàn bộ vòng đời.
 */
export function AuditLogDetailDialog({
  log,
  onOpenChange,
}: AuditLogDetailDialogProps) {
  const historyQuery = useQuery({
    queryKey: ['audit', 'trace', log?.entity, log?.entityId],
    queryFn: () => traceEntity(log!.entity, log!.entityId!),
    enabled: Boolean(log?.entity && log?.entityId),
  })

  const fields = log ? diffFields(log.before, log.after) : []
  const history = historyQuery.data ?? []

  return (
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {log ? (
              <Badge variant="outline" className={ACTION_BADGE[log.action]}>
                {AUDIT_ACTION_LABELS[log.action]}
              </Badge>
            ) : null}
            <span>
              {log ? (AUDIT_ENTITY_LABELS[log.entity] ?? log.entity) : ''}
            </span>
          </DialogTitle>
          <DialogDescription>
            Vết kiểm toán chi tiết — dữ liệu chỉ ghi thêm, không sửa, không xóa.
          </DialogDescription>
        </DialogHeader>

        {log ? (
          <div className="max-h-[70vh] space-y-4 overflow-auto pr-1">
            <Card>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Người thực hiện" value={log.actorEmail ?? '—'} />
                <Field label="Thời điểm" value={formatDateTime(log.createdAt)} />
                <Field
                  label="Request"
                  value={
                    log.method || log.path
                      ? `${log.method ?? ''} ${log.path ?? ''}`.trim()
                      : '—'
                  }
                  mono
                />
                <Field label="IP" value={log.ip ?? '—'} mono />
                <Field
                  label="Id bản ghi"
                  value={log.entityId ?? '—'}
                  mono
                  className="sm:col-span-2"
                />
                <Field
                  label="User agent"
                  value={log.userAgent ?? '—'}
                  className="sm:col-span-2"
                />
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b">
                <CardTitle className="text-base">
                  Thay đổi ({fields.filter((field) => field.changed).length}/
                  {fields.length} trường)
                </CardTitle>
              </CardHeader>
              {fields.length === 0 ? (
                <EmptyState message="Không có dữ liệu before/after." />
              ) : (
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Trường</TableHead>
                        <TableHead>Trước</TableHead>
                        <TableHead>Sau</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field) => (
                        <TableRow
                          key={field.field}
                          className={field.changed ? 'bg-amber-50/60' : undefined}
                        >
                          <TableCell className="font-mono text-xs font-medium">
                            {field.field}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm break-all">
                            {renderFieldValue(field.before)}
                          </TableCell>
                          <TableCell
                            className={`text-sm break-all ${
                              field.changed ? 'font-medium' : 'text-muted-foreground'
                            }`}
                          >
                            {renderFieldValue(field.after)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>

            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="size-4" />
                  Lịch sử bản ghi ({history.length})
                </CardTitle>
              </CardHeader>
              {historyQuery.isLoading ? (
                <TableLoading rows={2} cols={3} />
              ) : historyQuery.isError ? (
                <ErrorState message={apiErrorMessage(historyQuery.error)} />
              ) : history.length === 0 ? (
                <EmptyState message="Chưa có vết nào khác cho bản ghi này." />
              ) : (
                <CardContent className="divide-y p-0">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${
                        item.id === log.id ? 'bg-muted/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={ACTION_BADGE[item.action]}
                        >
                          {AUDIT_ACTION_LABELS[item.action]}
                        </Badge>
                        <span className="text-sm">
                          {item.actorEmail ?? 'Không xác định'}
                        </span>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        {item.id === log.id ? (
                          <span className="text-primary font-medium">
                            vết đang xem
                          </span>
                        ) : null}
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string
  value: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 text-sm break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}
