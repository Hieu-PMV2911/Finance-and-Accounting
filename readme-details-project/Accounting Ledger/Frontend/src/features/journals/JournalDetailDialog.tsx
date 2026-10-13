import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  ArrowLeftRight,
  BadgeCheck,
  BookCheck,
  LoaderCircle,
  Pencil,
  Send,
} from 'lucide-react'

import { ErrorState, LoadingState } from '@/components/DataStates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
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
import { sumMoney } from '@/lib/money'
import {
  JOURNAL_STATUS_LABELS,
  type JournalEntry,
  type JournalStatus,
} from '@/types/api'
import { fetchJournal } from './journals.api'

const STATUS_BADGE: Record<JournalStatus, string> = {
  draft: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  approved: 'border-blue-200 bg-blue-50 text-blue-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  reversed: 'border-rose-200 bg-rose-50 text-rose-700',
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '—'
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

interface JournalDetailDialogProps {
  entryId: string | null
  onOpenChange: (open: boolean) => void
  canMake: boolean
  canApprove: boolean
  canPost: boolean
  actionPending: boolean
  onEdit: (entry: JournalEntry) => void
  onApprove: (entry: JournalEntry) => void
  onPost: (entry: JournalEntry) => void
  onReverse: (entry: JournalEntry) => void
}

/**
 * Chi tiết bút toán: dòng định khoản, vết trạng thái và các hành động theo
 * vòng đời `draft → approved → posted → reversed`.
 */
export function JournalDetailDialog({
  entryId,
  onOpenChange,
  canMake,
  canApprove,
  canPost,
  actionPending,
  onEdit,
  onApprove,
  onPost,
  onReverse,
}: JournalDetailDialogProps) {
  const entryQuery = useQuery({
    queryKey: ['journals', 'detail', entryId],
    queryFn: () => fetchJournal(entryId!),
    enabled: Boolean(entryId),
  })

  const entry = entryQuery.data
  const lines = entry?.lines ?? []
  const totals = {
    debit: sumMoney(lines.map((line) => line.debit)),
    credit: sumMoney(lines.map((line) => line.credit)),
  }

  return (
    <Dialog open={Boolean(entryId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">
              {entry?.entryNo ?? 'Bút toán nháp'}
            </span>
            {entry ? (
              <Badge variant="outline" className={STATUS_BADGE[entry.status]}>
                {JOURNAL_STATUS_LABELS[entry.status]}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {entry ? entry.description : 'Đang tải chi tiết bút toán…'}
          </DialogDescription>
        </DialogHeader>

        {entryQuery.isLoading ? (
          <LoadingState />
        ) : entryQuery.isError ? (
          <ErrorState message={apiErrorMessage(entryQuery.error)} />
        ) : entry ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <InfoRow label="Ngày hạch toán" value={formatDate(entry.date)} />
              <InfoRow
                label="Kỳ kế toán"
                value={entry.period ? entry.period.code : '—'}
              />
              <InfoRow label="Số chứng từ gốc" value={entry.reference ?? '—'} />
              <InfoRow
                label="Người lập"
                value={<span className="font-mono">{shortId(entry.createdBy)}</span>}
              />
              <InfoRow
                label="Xác nhận"
                value={
                  entry.approvedAt
                    ? `${formatDateTime(entry.approvedAt)} · ${shortId(entry.approvedBy)}`
                    : '—'
                }
              />
              <InfoRow
                label="Ghi sổ"
                value={
                  entry.postedAt
                    ? `${formatDateTime(entry.postedAt)} · ${shortId(entry.postedBy)}`
                    : '—'
                }
              />
              <InfoRow
                label="Tạo lúc"
                value={formatDateTime(entry.createdAt)}
              />
              <InfoRow
                label="Cập nhật"
                value={formatDateTime(entry.updatedAt)}
              />
            </div>

            {entry.reversalOfEntryId ? (
              <p className="text-muted-foreground text-xs">
                Đây là <span className="text-foreground font-medium">bút toán đảo</span> của
                chứng từ <span className="font-mono">{shortId(entry.reversalOfEntryId)}</span>.
              </p>
            ) : null}
            {entry.reversedByEntryId ? (
              <p className="text-muted-foreground text-xs">
                Bút toán này đã bị đảo bởi chứng từ{' '}
                <span className="font-mono">{shortId(entry.reversedByEntryId)}</span>.
              </p>
            ) : null}

            <Separator />

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Tài khoản</TableHead>
                    <TableHead>Diễn giải</TableHead>
                    <TableHead className="text-right">Nợ</TableHead>
                    <TableHead className="text-right">Có</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-muted-foreground">
                        {line.lineNo}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm font-semibold">
                          {line.account?.code ?? '—'}
                        </span>
                        <span className="text-muted-foreground ml-2 text-sm">
                          {line.account?.name ?? ''}
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
                      {formatMoney(totals.debit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(totals.credit)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {entry && canMake && entry.status === 'draft' ? (
              <Button
                variant="outline"
                disabled={actionPending}
                onClick={() => onEdit(entry)}
              >
                <Pencil />
                Sửa nháp
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {entry && canApprove && entry.status === 'draft' ? (
              <Button
                disabled={actionPending}
                onClick={() => onApprove(entry)}
              >
                {actionPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <BadgeCheck />
                )}
                Xác nhận
              </Button>
            ) : null}

            {entry && canPost && entry.status === 'approved' ? (
              <Button disabled={actionPending} onClick={() => onPost(entry)}>
                {actionPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <BookCheck />
                )}
                Ghi sổ
              </Button>
            ) : null}

            {entry && canPost && entry.status === 'posted' ? (
              <Button
                variant="destructive"
                disabled={actionPending}
                onClick={() => onReverse(entry)}
              >
                <ArrowLeftRight />
                Đảo bút toán
              </Button>
            ) : null}

            {entry && entry.status === 'approved' && !canPost ? (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Send className="size-3.5" />
                Chờ người ghi sổ
              </span>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
