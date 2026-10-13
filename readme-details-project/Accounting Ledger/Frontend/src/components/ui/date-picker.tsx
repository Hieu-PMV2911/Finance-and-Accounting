import { useState } from 'react'
import dayjs from 'dayjs'
import { CalendarIcon, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  /** Ngày dạng `YYYY-MM-DD` (chuỗi rỗng = chưa chọn). */
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  /** Cho phép xoá ngày đã chọn (mặc định: có). */
  clearable?: boolean
  className?: string
  id?: string
  /**
   * Các khoảng ngày **không được chọn** (`YYYY-MM-DD`, bao gồm hai đầu).
   * Những ngày này bị làm mờ và không bấm được trên lịch.
   */
  disabledRanges?: { from: string; to: string }[]
}

/**
 * Ô chọn ngày dùng Calendar của shadcn/ui (react-day-picker) trong Popover.
 *
 * Giá trị vào/ra luôn là chuỗi `YYYY-MM-DD` — khớp tham số ngày của API và
 * tương thích với cách lưu ngày hiện có trong toàn bộ ứng dụng.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Chọn ngày',
  ariaLabel,
  disabled,
  clearable = true,
  className,
  id,
  disabledRanges,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? dayjs(value).toDate() : undefined

  // So sánh chuỗi `YYYY-MM-DD` theo thứ tự từ điển = so sánh theo thời gian.
  const isDisabled =
    disabledRanges && disabledRanges.length > 0
      ? (date: Date) => {
          const key = dayjs(date).format('YYYY-MM-DD')
          return disabledRanges.some(
            (range) => key >= range.from && key <= range.to,
          )
        }
      : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          data-empty={value ? undefined : 'true'}
          className={cn(
            'w-[150px] justify-start gap-2 font-normal data-[empty=true]:text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">
            {value ? dayjs(value).format('DD/MM/YYYY') : placeholder}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={isDisabled}
          onSelect={(date) => {
            onChange(date ? dayjs(date).format('YYYY-MM-DD') : '')
            setOpen(false)
          }}
          autoFocus
        />

        {clearable ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              <X />
              Xoá ngày
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
