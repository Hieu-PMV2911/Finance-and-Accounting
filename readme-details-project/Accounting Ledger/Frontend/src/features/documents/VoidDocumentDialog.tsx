import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'

import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { VoidDocumentPayload } from '@/types/api'

interface VoidDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  loading?: boolean
  onConfirm: (payload: VoidDocumentPayload) => void
}

/**
 * Hủy chứng từ — lý do là **bắt buộc**.
 *
 * Chứng từ đã ghi sổ không bị xóa: backend sinh **bút toán đảo** rồi mới đánh
 * dấu hủy. Ngày hạch toán của bút toán đảo để trống thì dùng ngày chứng từ.
 */
export function VoidDocumentDialog({
  open,
  onOpenChange,
  title,
  description,
  loading = false,
  onConfirm,
}: VoidDocumentDialogProps) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Vui lòng nhập lý do hủy')
      return
    }
    setError(null)
    onConfirm({ reason: trimmed, date: date || undefined })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              'Chứng từ đã ghi sổ sẽ sinh bút toán đảo; bút toán gốc không bị sửa.'}
          </DialogDescription>
        </DialogHeader>

        <form id="void-document-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="void-reason">Lý do hủy *</Label>
            <Textarea
              id="void-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: khách hủy đơn — xuất hóa đơn thay thế"
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label>Ngày bút toán đảo</Label>
            <DatePicker
              value={date}
              onChange={setDate}
              placeholder="Bỏ trống = ngày chứng từ"
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Đóng
          </Button>
          <Button
            type="submit"
            form="void-document-form"
            variant="destructive"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang hủy…
              </>
            ) : (
              'Hủy chứng từ'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
