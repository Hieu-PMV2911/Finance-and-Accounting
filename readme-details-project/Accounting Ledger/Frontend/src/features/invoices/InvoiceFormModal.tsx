import { useState, type FormEvent } from 'react'
import dayjs from 'dayjs'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiErrorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import type {
  CreateSalesInvoicePayload,
  Party,
  SalesInvoice,
} from '@/types/api'
import { EMPTY_LINE, type EditableLine } from '../documents/editable-line'
import { LineItemsEditor } from '../documents/LineItemsEditor'
import { lineAmount, sumAmounts, toMoneyString } from '../documents/money'
import { createSalesInvoice, updateSalesInvoice } from './invoices.api'

interface InvoiceFormModalProps {
  /** Component được render có điều kiện khi mở ⇒ state khởi tạo lại mỗi lần. */
  invoice: SalesInvoice | null
  parties: Party[]
  onClose: () => void
  onSaved: () => void
}

export function InvoiceFormModal({
  invoice,
  parties,
  onClose,
  onSaved,
}: InvoiceFormModalProps) {
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoiceNo ?? '')
  const [partyId, setPartyId] = useState(invoice?.partyId ?? '')
  const [date, setDate] = useState(
    invoice?.date ?? dayjs().format('YYYY-MM-DD'),
  )
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? '')
  const [description, setDescription] = useState(invoice?.description ?? '')
  const [taxAmount, setTaxAmount] = useState(invoice?.taxAmount ?? '0')
  const [lines, setLines] = useState<EditableLine[]>(
    invoice?.lines?.length
      ? invoice.lines.map((line) => ({
          description: line.description ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        }))
      : [{ ...EMPTY_LINE }],
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const lineAmounts = lines.map((line) =>
    lineAmount(line.quantity, line.unitPrice),
  )
  const subtotal = sumAmounts(lineAmounts)
  const tax = toMoneyString(taxAmount || '0')
  const total = sumAmounts([subtotal, tax])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!invoiceNo.trim()) {
      setError('Vui lòng nhập số hóa đơn')
      return
    }
    if (!partyId) {
      setError('Vui lòng chọn khách hàng')
      return
    }
    if (!date) {
      setError('Vui lòng chọn ngày hóa đơn')
      return
    }
    if (lines.some((line) => !(Number(line.quantity) > 0))) {
      setError('Số lượng mỗi dòng phải lớn hơn 0')
      return
    }
    if (lines.some((line) => !(Number(line.unitPrice) > 0))) {
      setError('Đơn giá mỗi dòng phải lớn hơn 0')
      return
    }
    if (Number(tax) < 0) {
      setError('Tiền thuế không được âm')
      return
    }

    const payload: CreateSalesInvoicePayload = {
      invoiceNo: invoiceNo.trim(),
      partyId,
      date,
      dueDate: dueDate || undefined,
      description: description.trim() || undefined,
      currency: 'VND',
      subtotal,
      taxAmount: tax,
      total,
      lines: lines.map((line, index) => ({
        description: line.description.trim() || undefined,
        quantity: toMoneyString(line.quantity),
        unitPrice: toMoneyString(line.unitPrice),
        amount: lineAmounts[index],
      })),
    }

    setSaving(true)
    try {
      if (invoice) {
        await updateSalesInvoice(invoice.id, payload)
        toast.success('Đã cập nhật hóa đơn bán')
      } else {
        await createSalesInvoice(payload)
        toast.success('Đã tạo hóa đơn bán (nháp)')
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu hóa đơn thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const customers = parties.filter((party) => party.type !== 'vendor')

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {invoice
              ? `Sửa hóa đơn bán ${invoice.invoiceNo}`
              : 'Tạo hóa đơn bán'}
          </DialogTitle>
          <DialogDescription>
            Hóa đơn lưu ở trạng thái nháp; ghi sổ mới sinh bút toán. Tài khoản
            doanh thu lấy theo luật mặc định.
          </DialogDescription>
        </DialogHeader>

        <form
          id="invoice-form"
          className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1"
          onSubmit={onSubmit}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="invoice-no">Số hóa đơn *</Label>
              <Input
                id="invoice-no"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="HD-2026-001"
              />
            </div>
            <div className="grid gap-2">
              <Label>Khách hàng *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn khách hàng" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.code} — {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Ngày hóa đơn *</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="grid gap-2">
              <Label>Ngày đến hạn</Label>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                placeholder="Không có hạn"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-desc">Diễn giải</Label>
            <Textarea
              id="invoice-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Dòng hàng hóa / dịch vụ</Label>
            <LineItemsEditor lines={lines} onChange={setLines} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="invoice-tax">Tiền thuế</Label>
              <Input
                id="invoice-tax"
                className="text-right tabular-nums"
                inputMode="decimal"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
            <div className="grid content-end gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span className="tabular-nums">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Tổng cộng</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </div>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form="invoice-form" disabled={saving}>
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
