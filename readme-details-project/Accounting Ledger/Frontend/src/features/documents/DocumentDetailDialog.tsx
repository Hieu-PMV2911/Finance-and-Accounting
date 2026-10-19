import { LoadingState } from '@/components/DataStates'
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
import { formatDate, formatMoney } from '@/lib/format'
import type { DocumentLine, DocumentStatus } from '@/types/api'
import { DocumentStatusBadge } from './DocumentStatusBadge'

interface DocumentDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  code: string
  status: DocumentStatus
  partyName?: string | null
  date: string
  dueDate?: string | null
  description?: string | null
  lines?: DocumentLine[]
  subtotal: string
  taxAmount: string
  total: string
  journalEntryId?: string | null
  reversalJournalEntryId?: string | null
  voidReason?: string | null
  loading?: boolean
}

/**
 * Chi tiết chứng từ (hóa đơn bán/mua) — phần trình bày thuần túy.
 *
 * Danh sách **không** trả `lines`, nên nơi gọi tự tải chi tiết rồi mới mở hộp
 * thoại; ở đây chỉ hiển thị. Bút toán gốc và bút toán đảo được hiện **song song**
 * để người đọc thấy chứng từ đã hủy vẫn còn đủ vết, không bị xóa.
 */
export function DocumentDetailDialog({
  open,
  onOpenChange,
  title,
  code,
  status,
  partyName,
  date,
  dueDate,
  description,
  lines,
  subtotal,
  taxAmount,
  total,
  journalEntryId,
  reversalJournalEntryId,
  voidReason,
  loading = false,
}: DocumentDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {title} <span className="font-mono">{code}</span>
            <DocumentStatusBadge status={status} />
          </DialogTitle>
          <DialogDescription>
            {partyName ?? '—'} · ngày {formatDate(date)}
            {dueDate ? ` · đến hạn ${formatDate(dueDate)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <LoadingState label="Đang tải chi tiết…" />
        ) : (
          <div className="grid gap-4">
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}

            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Diễn giải</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lines ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-muted-foreground h-16 text-center"
                      >
                        Không có dòng chi tiết.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (lines ?? []).map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {line.lineNo}
                        </TableCell>
                        <TableCell>
                          <div className="grid">
                            <span>{line.description || '—'}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatMoney(line.quantity)} ×{' '}
                              {formatMoney(line.unitPrice)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(line.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="ml-auto grid w-full max-w-xs gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span className="tabular-nums">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Thuế</span>
                <span className="tabular-nums">{formatMoney(taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-medium">
                <span>Tổng cộng</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </div>
            </div>

            {journalEntryId || reversalJournalEntryId || voidReason ? (
              <div className="text-muted-foreground grid gap-1 border-t pt-3 text-xs">
                {journalEntryId ? (
                  <p>
                    Bút toán gốc:{' '}
                    <span className="text-foreground font-mono">
                      {journalEntryId}
                    </span>
                  </p>
                ) : null}
                {reversalJournalEntryId ? (
                  <p>
                    Bút toán đảo:{' '}
                    <span className="text-foreground font-mono">
                      {reversalJournalEntryId}
                    </span>
                  </p>
                ) : null}
                {voidReason ? <p>Lý do hủy: {voidReason}</p> : null}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
