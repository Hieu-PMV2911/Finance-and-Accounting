import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import type { EditableLine } from './editable-line'
import { EMPTY_LINE } from './editable-line'
import { lineAmount, sumAmounts } from './money'

interface LineItemsEditorProps {
  lines: EditableLine[]
  onChange: (lines: EditableLine[]) => void
  disabled?: boolean
}

/**
 * Bộ nhập dòng hàng hóa/dịch vụ.
 *
 * **Thành tiền là giá trị dẫn xuất** (`số lượng × đơn giá`) — không cho nhập tay,
 * nên không thể có trạng thái "dòng ghi 1.000.000 nhưng 1 × 900.000". Tài khoản
 * doanh thu/chi phí cũng không hiện ở đây: người lập thường không chọn, hệ thống
 * giải theo luật mặc định (mục 10.A).
 */
export function LineItemsEditor({
  lines,
  onChange,
  disabled = false,
}: LineItemsEditorProps) {
  const update = (index: number, patch: Partial<EditableLine>) => {
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    )
  }

  const remove = (index: number) => {
    onChange(lines.filter((_, i) => i !== index))
  }

  const subtotal = sumAmounts(
    lines.map((line) => lineAmount(line.quantity, line.unitPrice)),
  )

  return (
    <div className="grid gap-3">
      <div className="text-muted-foreground hidden gap-2 text-xs sm:grid sm:grid-cols-[1fr_80px_130px_120px_36px]">
        <span>Diễn giải</span>
        <span className="text-right">Số lượng</span>
        <span className="text-right">Đơn giá</span>
        <span className="text-right">Thành tiền</span>
        <span className="sr-only">Xóa</span>
      </div>

      {lines.map((line, index) => (
        <div
          key={index}
          className="grid gap-2 sm:grid-cols-[1fr_80px_130px_120px_36px] sm:items-center"
        >
          <Input
            aria-label={`Diễn giải dòng ${index + 1}`}
            placeholder="Nội dung hàng hóa/dịch vụ"
            value={line.description}
            onChange={(e) => update(index, { description: e.target.value })}
            disabled={disabled}
          />
          <Input
            aria-label={`Số lượng dòng ${index + 1}`}
            className="text-right tabular-nums"
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => update(index, { quantity: e.target.value })}
            disabled={disabled}
          />
          <Input
            aria-label={`Đơn giá dòng ${index + 1}`}
            className="text-right tabular-nums"
            inputMode="decimal"
            placeholder="0"
            value={line.unitPrice}
            onChange={(e) => update(index, { unitPrice: e.target.value })}
            disabled={disabled}
          />
          <div className="text-right text-sm tabular-nums">
            {formatMoney(lineAmount(line.quantity, line.unitPrice))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 justify-self-end"
            aria-label={`Xóa dòng ${index + 1}`}
            onClick={() => remove(index)}
            disabled={disabled || lines.length === 1}
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, { ...EMPTY_LINE }])}
          disabled={disabled}
        >
          <Plus /> Thêm dòng
        </Button>
        <p className="text-sm">
          Tạm tính{' '}
          <span className="font-medium tabular-nums">{formatMoney(subtotal)}</span>
        </p>
      </div>
    </div>
  )
}
