import { useQuery } from '@tanstack/react-query'
import { FileText, History, ScrollText } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  JOURNAL_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
  type JournalStatus,
} from '@/types/api'
import { traceJournalEntry } from './audit.api'
import { ACTION_BADGE } from './audit-ui'

const STATUS_BADGE: Record<JournalStatus, string> = {
  draft: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  approved: 'border-blue-200 bg-blue-50 text-blue-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  reversed: 'border-rose-200 bg-rose-50 text-rose-700',
}

/**
 * Truy vết một bút toán (mục 8): **báo cáo → bút toán → chứng từ nguồn**.
 *
 * Trả lời câu hỏi "con số này từ đâu ra và ai đã làm": hiển thị dòng định khoản,
 * kỳ kế toán, số chứng từ gốc và toàn bộ vết kiểm toán của bút toán.
 */
export function TraceJournalView({ entryId }: { entryId: string }) {
  const query = useQuery({
    queryKey: ['audit', 'trace-journal', entryId],
    queryFn: () => traceJournalEntry(entryId),
    enabled: Boolean(entryId),
  })

  if (!entryId) {
    return <EmptyState message="Chọn một bút toán để truy vết." />
  }
  if (query.isLoading) {
    return <TableLoading rows={4} cols={4} />
  }
  if (query.isError) {
    return <ErrorState message={apiErrorMessage(query.error)} />
  }

  const trace = query.data
  if (!trace) return <EmptyState message="Không có dữ liệu truy vết." />

  const status = trace.journal.status as JournalStatus

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <ScrollText className="size-4" />
            <span className="font-mono">{trace.journal.entryNo ?? '(chưa cấp số)'}</span>
            <Badge variant="outline" className={STATUS_BADGE[status]}>
              {JOURNAL_STATUS_LABELS[status] ?? trace.journal.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Ngày hạch toán" value={formatDate(trace.journal.date)} />
          <Field label="Kỳ kế toán" value={trace.journal.periodCode ?? '—'} />
          <Field
            label="Tổng Nợ / Có"
            value={`${formatMoney(trace.journal.totalDebit)} / ${formatMoney(trace.journal.totalCredit)}`}
            mono
          />
          <Field
            label="Diễn giải"
            value={trace.journal.description}
            className="sm:col-span-2 lg:col-span-1"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Chứng từ nguồn
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {trace.source ? (
            <>
              {/* Ưu tiên số đọc từ chính bảng nghiệp vụ (mục 10.0) — đáng tin hơn
                  chuỗi `reference` người lập gõ; khi chưa có thì rơi về chuỗi cũ. */}
              <p className="font-mono text-lg font-semibold">
                {trace.source.code ?? trace.sourceDocument ?? trace.source.id}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {SOURCE_TYPE_LABELS[trace.source.type] ?? trace.source.type}
                </Badge>
                {trace.sourceDocument &&
                  trace.sourceDocument !== trace.source.code && (
                    <span className="text-muted-foreground text-sm">
                      Tham chiếu trên bút toán: {trace.sourceDocument}
                    </span>
                  )}
              </div>
            </>
          ) : trace.sourceDocument ? (
            <p className="font-mono text-lg font-semibold">
              {trace.sourceDocument}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Bút toán không gắn số chứng từ gốc.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            Dòng định khoản ({trace.lines.length})
          </CardTitle>
        </CardHeader>
        {trace.lines.length === 0 ? (
          <EmptyState message="Bút toán không có dòng định khoản." />
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>Tài khoản</TableHead>
                  <TableHead>Diễn giải</TableHead>
                  <TableHead className="text-right">Nợ</TableHead>
                  <TableHead className="text-right">Có</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.lines.map((line) => (
                  <TableRow key={line.lineNo}>
                    <TableCell className="text-muted-foreground text-sm">
                      {line.lineNo}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-mono text-sm font-semibold">
                        {line.accountCode}
                      </span>
                      <span className="text-muted-foreground ml-2 text-sm">
                        {line.accountName}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {line.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(line.debit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(line.credit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Tổng cộng</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(trace.journal.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(trace.journal.totalCredit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        )}
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Vết kiểm toán của bút toán ({trace.history.length})
          </CardTitle>
        </CardHeader>
        {trace.history.length === 0 ? (
          <EmptyState message="Bút toán này chưa có vết kiểm toán (dữ liệu tạo ngoài request API)." />
        ) : (
          <CardContent className="divide-y p-0">
            {trace.history.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={ACTION_BADGE[log.action]}>
                    {AUDIT_ACTION_LABELS[log.action]}
                  </Badge>
                  <span className="text-sm">
                    {log.actorEmail ?? 'Không xác định'}
                  </span>
                </div>
                <div className="text-muted-foreground flex items-center gap-3 text-xs">
                  <span>{formatDateTime(log.createdAt)}</span>
                  {log.method ? (
                    <span className="font-mono">
                      {log.method} {log.path}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <p className="text-muted-foreground text-xs">
        Bảng: {AUDIT_ENTITY_LABELS[trace.entity] ?? trace.entity} · id{' '}
        <span className="font-mono">{trace.entityId}</span>
      </p>
    </div>
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
      <p className={`mt-1 text-sm ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </p>
    </div>
  )
}
