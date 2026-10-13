import { useState, type FormEvent } from 'react'
import dayjs from 'dayjs'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiErrorMessage } from '@/lib/api'
import { formatDateInput } from '@/lib/format'
import type { FiscalPeriod } from '@/types/api'
import { createFiscalPeriod, updateFiscalPeriod } from './periods.api'

const schema = z.object({
  code: z
    .string()
    .min(1, 'Vui lòng nhập mã kỳ')
    .max(32, 'Mã kỳ tối đa 32 ký tự')
    .regex(
      /^[0-9A-Za-z._-]+$/,
      'Mã kỳ chỉ gồm chữ, số và các ký tự ".", "-", "_"',
    ),
  name: z
    .string()
    .min(1, 'Vui lòng nhập tên kỳ')
    .max(255, 'Tên kỳ tối đa 255 ký tự'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Vui lòng chọn ngày bắt đầu'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vui lòng chọn ngày kết thúc'),
  notes: z.string().max(2000, 'Ghi chú tối đa 2000 ký tự'),
})

interface PeriodPreset {
  label: string
  build: () => { code: string; name: string; startDate: string; endDate: string }
}

const PRESETS: PeriodPreset[] = [
  {
    label: 'Tháng này',
    build: () => {
      const start = dayjs().startOf('month')
      return {
        code: start.format('YYYY-MM'),
        name: `Tháng ${start.format('MM/YYYY')}`,
        startDate: formatDateInput(start),
        endDate: formatDateInput(start.endOf('month')),
      }
    },
  },
  {
    label: 'Quý này',
    build: () => {
      const quarter = Math.floor(dayjs().month() / 3)
      const start = dayjs()
        .month(quarter * 3)
        .startOf('month')
      return {
        code: `${start.format('YYYY')}-Q${quarter + 1}`,
        name: `Quý ${quarter + 1}/${start.format('YYYY')}`,
        startDate: formatDateInput(start),
        endDate: formatDateInput(start.add(2, 'month').endOf('month')),
      }
    },
  },
  {
    label: 'Năm nay',
    build: () => {
      const start = dayjs().startOf('year')
      return {
        code: start.format('YYYY'),
        name: `Năm ${start.format('YYYY')}`,
        startDate: formatDateInput(start),
        endDate: formatDateInput(start.endOf('year')),
      }
    },
  },
]

interface FiscalPeriodFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = tạo mới, ngược lại là sửa (chỉ kỳ đang mở mới sửa được). */
  period: FiscalPeriod | null
  onSaved: () => void
}

/**
 * Dialog tạo/sửa kỳ kế toán.
 *
 * Cha truyền `key` thay đổi mỗi lần mở (xem `FiscalPeriodsPage`) để component
 * remount với giá trị khởi tạo đúng — tránh đồng bộ state bằng effect.
 */
export function FiscalPeriodFormModal({
  open,
  onOpenChange,
  period,
  onSaved,
}: FiscalPeriodFormModalProps) {
  const [code, setCode] = useState(period?.code ?? '')
  const [name, setName] = useState(period?.name ?? '')
  const [startDate, setStartDate] = useState(
    period ? formatDateInput(period.startDate) : '',
  )
  const [endDate, setEndDate] = useState(
    period ? formatDateInput(period.endDate) : '',
  )
  const [notes, setNotes] = useState(period?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const applyPreset = (preset: PeriodPreset) => {
    const values = preset.build()
    if (!period) setCode(values.code)
    setName(values.name)
    setStartDate(values.startDate)
    setEndDate(values.endDate)
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const parsed = schema.safeParse({ code, name, startDate, endDate, notes })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
      return
    }
    if (parsed.data.startDate > parsed.data.endDate) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc')
      return
    }

    setSaving(true)
    try {
      if (period) {
        await updateFiscalPeriod(period.id, {
          name: parsed.data.name.trim(),
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          notes: parsed.data.notes.trim() || null,
        })
        toast.success(`Đã cập nhật kỳ ${period.code}`)
      } else {
        await createFiscalPeriod({
          code: parsed.data.code.trim(),
          name: parsed.data.name.trim(),
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          notes: parsed.data.notes.trim() || undefined,
        })
        toast.success(`Đã tạo kỳ ${parsed.data.code.trim()}`)
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu kỳ kế toán thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {period ? `Sửa kỳ ${period.code}` : 'Thêm kỳ kế toán'}
          </DialogTitle>
          <DialogDescription>
            Các kỳ không được chồng lấn nhau — một ngày chỉ thuộc tối đa một kỳ.
            Chỉ kỳ đang mở mới nhận bút toán.
          </DialogDescription>
        </DialogHeader>

        <form id="period-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {period ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">Điền nhanh:</span>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="period-code">Mã kỳ *</Label>
              <Input
                id="period-code"
                value={code}
                disabled={Boolean(period)}
                onChange={(event) => setCode(event.target.value)}
                placeholder="2026-01"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="period-name">Tên kỳ *</Label>
              <Input
                id="period-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tháng 01/2026"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="period-start">Ngày bắt đầu *</Label>
              <Input
                id="period-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="period-end">Ngày kết thúc *</Label>
              <Input
                id="period-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="period-notes">Ghi chú</Label>
            <Textarea
              id="period-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button type="submit" form="period-form" disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang lưu…
              </>
            ) : (
              'Lưu'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
