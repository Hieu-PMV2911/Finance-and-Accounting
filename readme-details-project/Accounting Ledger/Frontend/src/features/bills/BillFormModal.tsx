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
import type { CreateVendorBillPayload, Party, VendorBill } from '@/types/api'
import { EMPTY_LINE, type EditableLine } from '../documents/editable-line'
import { LineItemsEditor } from '../documents/LineItemsEditor'
import { lineAmount, sumAmounts, toMoneyString } from '../documents/money'
import { createVendorBill, updateVendorBill } from './bills.api'

interface BillFormModalProps {
  /** Component được render có điều kiện khi mở ⇒ state khởi tạo lại mỗi lần. */
  bill: VendorBill | null
  parties: Party[]
  onClose: () => void
  onSaved: () => void
}

export function BillFormModal({
  bill,
  parties,
  onClose,
  onSaved,
}: BillFormModalProps) {
  const [billNo, setBillNo] = useState(bill?.billNo ?? '')
  const [partyId, setPartyId] = useState(bill?.partyId ?? '')
  const [date, setDate] = useState(bill?.date ?? dayjs().format('YYYY-MM-DD'))
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? '')
  const [description, setDescription] = useState(bill?.description ?? '')
  const [taxAmount, setTaxAmount] = useState(bill?.taxAmount ?? '0')
  const [lines, setLines] = useState<EditableLine[]>(
    bill?.lines?.length
      ? bill.lines.map((line) => ({
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

    if (!billNo.trim()) {
      setError('Vui lòng nhập số hóa đơn mua')
      return
    }
    if (!partyId) {
      setError('Vui lòng chọn nhà cung cấp')
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

    const payload: CreateVendorBillPayload = {
      billNo: billNo.trim(),
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
      if (bill) {
        await updateVendorBill(bill.id, payload)
        toast.success('Đã cập nhật hóa đơn mua')
      } else {
        await createVendorBill(payload)
        toast.success('Đã tạo hóa đơn mua (nháp)')
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu hóa đơn mua thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const vendors = parties.filter((party) => party.type !== 'customer')

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {bill ? `Sửa hóa đơn mua ${bill.billNo}` : 'Tạo hóa đơn mua'}
          </DialogTitle>
          <DialogDescription>
            Hóa đơn mua lưu ở trạng thái nháp; ghi sổ mới sinh bút toán. Tài khoản
            chi phí lấy theo luật mặc định.
          </DialogDescription>
        </DialogHeader>

        <form
          id="bill-form"
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
              <Label htmlFor="bill-no">Số hóa đơn mua *</Label>
              <Input
                id="bill-no"
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                placeholder="HDM-2026-001"
              />
            </div>
            <div className="grid gap-2">
              <Label>Nhà cung cấp *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn nhà cung cấp" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((party) => (
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
            <Label htmlFor="bill-desc">Diễn giải</Label>
            <Textarea
              id="bill-desc"
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
              <Label htmlFor="bill-tax">Tiền thuế</Label>
              <Input
                id="bill-tax"
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
          <Button type="submit" form="bill-form" disabled={saving}>
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
