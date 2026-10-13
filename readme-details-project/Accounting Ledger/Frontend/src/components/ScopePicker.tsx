import dayjs from 'dayjs'
import { CalendarRange } from 'lucide-react'

import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FiscalPeriod, ReportScope } from '@/types/api'

/** Giá trị sentinel cho mục "khoảng ngày tùy chọn" trong Select. */
const CUSTOM = '__custom__'

interface ScopePickerProps {
  periods: readonly FiscalPeriod[]
  value: ReportScope
  onChange: (next: ReportScope) => void
}

/**
 * Chọn phạm vi cho sổ cái / báo cáo: **theo kỳ kế toán** hoặc **khoảng ngày tùy chọn**.
 *
 * Backend chỉ nhận một trong hai cách nên khi chọn kỳ ta bỏ hẳn phần ngày và
 * ngược lại — giá trị trả lên luôn ở đúng một dạng.
 */
export function ScopePicker({ periods, value, onChange }: ScopePickerProps) {
  const isCustom = !value.periodId

  const handleSelect = (next: string) => {
    if (next === CUSTOM) {
      onChange({
        fromDate: value.fromDate || dayjs().startOf('year').format('YYYY-MM-DD'),
        toDate: value.toDate || dayjs().format('YYYY-MM-DD'),
      })
      return
    }
    onChange({ periodId: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.periodId ?? CUSTOM} onValueChange={handleSelect}>
        <SelectTrigger className="w-[280px]">
          <CalendarRange className="size-4 shrink-0 opacity-60" />
          <SelectValue placeholder="Chọn phạm vi" />
        </SelectTrigger>
        <SelectContent>
          {periods.map((period) => (
            <SelectItem key={period.id} value={period.id}>
              {period.code} — {period.name}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Khoảng ngày tùy chọn…</SelectItem>
        </SelectContent>
      </Select>

      {isCustom ? (
        <div className="flex items-center gap-2">
          <DatePicker
            ariaLabel="Từ ngày"
            value={value.fromDate ?? ''}
            onChange={(next) =>
              onChange({ fromDate: next, toDate: value.toDate })
            }
            placeholder="Từ ngày"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <DatePicker
            ariaLabel="Đến ngày"
            value={value.toDate ?? ''}
            onChange={(next) =>
              onChange({ fromDate: value.fromDate, toDate: next })
            }
            placeholder="Đến ngày"
          />
        </div>
      ) : null}
    </div>
  )
}
