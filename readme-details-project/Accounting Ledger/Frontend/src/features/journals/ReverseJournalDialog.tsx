import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiErrorMessage } from '@/lib/api'
import { formatDateInput, formatMoney } from '@/lib/format'
import type { JournalEntry } from '@/types/api'
import { reverseJournal } from './journals.api'

interface ReverseJournalDialogProps {
  /** Bút toán gốc cần đảo; null = đóng. */
  entry: JournalEntry | null
  onOpenChange: (open: boolean) => void
  onDone: (reversal: JournalEntry) => void
}

/**
 * Đảo bút toán đã ghi sổ.
 *
 * Không sửa/xóa bản gốc (bất biến số 2): hệ thống tạo một **bút toán đảo** với
 * Nợ/Có hoán đổi, ghi sổ ngay, và chuyển bản gốc sang trạng thái `reversed`.
 */
export function ReverseJournalDialog({
  entry,
  onOpenChange,
  onDone,
}: ReverseJournalDialogProps) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const effectiveDate = date || (entry ? formatDateInput(entry.date) : '')

  const mutation = useMutation({
    mutationFn: () =>
      reverseJournal(entry!.id, {
        reason: reason.trim(),
        date: date || undefined,
      }),
    onSuccess: (reversal) => {
      setReason('')
      setDate('')
      onDone(reversal)
    },
    onError: (err) => setError(apiErrorMessage(err, 'Đảo bút toán thất bại')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do đảo (lưu vết kiểm toán)')
      return
    }
    if (reason.trim().length > 500) {
      setError('Lý do đảo tối đa 500 ký tự')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Đảo bút toán {entry?.entryNo ?? ''}</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ tạo một bút toán mới với Nợ/Có hoán đổi và ghi sổ ngay.
            Bút toán gốc được giữ nguyên, chỉ chuyển sang trạng thái “Đã đảo”.
          </DialogDescription>
        </DialogHeader>

        <form id="reverse-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="reverse-reason">Lý do đảo *</Label>
            <Textarea
              id="reverse-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ghi nhận sai tài khoản, đảo để hạch toán lại"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reverse-date">Ngày hạch toán bút toán đảo</Label>
            <DatePicker
              id="reverse-date"
              className="w-full"
              value={date}
              onChange={setDate}
              placeholder="Mặc định theo bút toán gốc"
            />
            <p className="text-muted-foreground text-xs">
              Bỏ trống thì dùng ngày của bút toán gốc ({formatDateInput(entry?.date)}).
              Ngày phải thuộc một kỳ đang mở.
            </p>
          </div>

          {entry && entry.lines.length > 0 ? (
            <div className="grid gap-2">
              <Label>Dòng định khoản sẽ được hoán đổi</Label>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead className="text-right">Nợ</TableHead>
                      <TableHead className="text-right">Có</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <span className="font-mono text-sm font-semibold">
                            {line.account?.code ?? '—'}
                          </span>
                          <span className="text-muted-foreground ml-2 text-sm">
                            {line.account?.name ?? ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(line.credit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(line.debit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground text-xs">
                Cột Nợ/Có ở trên đã hoán đổi so với bút toán gốc · ngày hiệu lực{' '}
                <span className="text-foreground font-medium">
                  {effectiveDate}
                </span>
              </p>
            </div>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            form="reverse-form"
            variant="destructive"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang đảo…
              </>
            ) : (
              'Xác nhận đảo'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
