import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search, ShieldCheck } from 'lucide-react'

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
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditAction,
  type AuditLog,
} from '@/types/api'
import { listJournals } from '../journals/journals.api'
import { AuditLogDetailDialog } from './AuditLogDetailDialog'
import { TraceJournalView } from './TraceJournalView'
import { ACTION_BADGE } from './audit-ui'
import { listAuditLogs } from './audit.api'

const ALL = '__all__'

const ENTITY_OPTIONS = Object.entries(AUDIT_ENTITY_LABELS)

/**
 * Kiểm toán (mục 8) — **chỉ admin**.
 *
 * Hai phần: nhật ký thay đổi dữ liệu (before/after, actor, thời điểm) và truy
 * vết một bút toán từ báo cáo ngược về chứng từ nguồn.
 */
export function AuditPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Kiểm toán"
        description="Vết kiểm toán mọi thay đổi dữ liệu và truy vết bút toán về chứng từ nguồn."
      />

      <Tabs defaultValue="logs" className="gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="logs">Nhật ký thay đổi</TabsTrigger>
          <TabsTrigger value="trace">Truy vết bút toán</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <AuditLogsTab />
        </TabsContent>

        <TabsContent value="trace">
          <TraceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AuditLogsTab() {
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState<AuditAction | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [limit, setLimit] = useState('100')
  const [detail, setDetail] = useState<AuditLog | null>(null)

  const filters = {
    search: search || undefined,
    entity: entity || undefined,
    action: action || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    limit: Number(limit),
  }

  const query = useQuery({
    queryKey: ['audit-logs', 'list', filters],
    queryFn: () => listAuditLogs(filters),
  })

  const logs = query.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Tìm theo email, bảng, id bản ghi hoặc đường dẫn…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          value={entity || ALL}
          onValueChange={(value) => setEntity(value === ALL ? '' : value)}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Bảng dữ liệu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả bảng</SelectItem>
            {ENTITY_OPTIONS.map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={action || ALL}
          onValueChange={(value) =>
            setAction(value === ALL ? '' : (value as AuditAction))
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Hành động" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả hành động</SelectItem>
            {AUDIT_ACTIONS.map((item) => (
              <SelectItem key={item} value={item}>
                {AUDIT_ACTION_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Số dòng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 dòng</SelectItem>
            <SelectItem value="100">100 dòng</SelectItem>
            <SelectItem value="200">200 dòng</SelectItem>
            <SelectItem value="500">500 dòng</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            className="w-[150px]"
            type="date"
            aria-label="Từ ngày"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            className="w-[150px]"
            type="date"
            aria-label="Đến ngày"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>

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
          <TableLoading cols={6} />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : logs.length === 0 ? (
          <EmptyState message="Không có vết kiểm toán nào phù hợp. Vết chỉ được ghi khi thay đổi dữ liệu qua API." />
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời điểm</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Bảng dữ liệu</TableHead>
                  <TableHead>Id bản ghi</TableHead>
                  <TableHead>Người thực hiện</TableHead>
                  <TableHead>Request</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(log)}
                  >
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ACTION_BADGE[log.action]}>
                        {AUDIT_ACTION_LABELS[log.action]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {AUDIT_ENTITY_LABELS[log.entity] ?? log.entity}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.entityId ? `${log.entityId.slice(0, 8)}…` : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.actorEmail ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {log.method ?? ''} {log.path ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck className="size-3.5" />
        Hiển thị {logs.length} vết · nhấn một dòng để xem before/after và lịch sử
        bản ghi.
      </p>

      <AuditLogDetailDialog
        log={detail}
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </div>
  )
}

function TraceTab() {
  const journalsQuery = useQuery({
    queryKey: ['journals', 'audit-trace-options'],
    queryFn: () => listJournals({ limit: 100 }),
  })
  const journals = journalsQuery.data ?? []

  const [entryId, setEntryId] = useState('')
  const effectiveEntryId = entryId || journals[0]?.id || ''

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={effectiveEntryId}
        onValueChange={setEntryId}
        disabled={journalsQuery.isLoading || journals.length === 0}
      >
        <SelectTrigger className="w-full max-w-xl">
          <SelectValue placeholder="Chọn bút toán để truy vết" />
        </SelectTrigger>
        <SelectContent>
          {journals.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.entryNo ?? '(nháp)'} · {entry.description.slice(0, 60)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {journalsQuery.isError ? (
        <Card className="gap-0 py-0">
          <ErrorState message={apiErrorMessage(journalsQuery.error)} />
        </Card>
      ) : journals.length === 0 && !journalsQuery.isLoading ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Chưa có bút toán nào để truy vết." />
        </Card>
      ) : (
        <TraceJournalView entryId={effectiveEntryId} />
      )}
    </div>
  )
}
