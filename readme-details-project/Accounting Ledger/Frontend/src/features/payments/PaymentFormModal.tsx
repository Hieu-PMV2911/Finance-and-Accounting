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
import {
  PAYMENT_DIRECTIONS,
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Account,
  type CreatePaymentPayload,
  type Party,
  type Payment,
  type PaymentDirection,
  type PaymentMethod,
} from '@/types/api'
import { toMoneyString } from '../documents/money'
import { createPayment, updatePayment } from './payments.api'

interface PaymentFormModalProps {
  /** Render có điều kiện khi mở ⇒ state khởi tạo lại mỗi lần. */
  payment: Payment | null
  parties: Party[]
  accounts: Account[]
  onClose: () => void
  onSaved: () => void
}

/**
 * Phiếu thu / phiếu chi (mục 10.A).
 *
 * Một form cho cả hai chiều: mọi trường giống nhau, chỉ khác chiều hạch toán.
 * `idempotencyKey` được sinh **một lần khi mở form** — bấm Lưu hai lần (do
 * timeout mạng) không tạo hai phiếu.
 */
export function PaymentFormModal({
  payment,
  parties,
  accounts,
  onClose,
  onSaved,
}: PaymentFormModalProps) {
  const [code, setCode] = useState(payment?.code ?? '')
  const [direction, setDirection] = useState<PaymentDirection>(
    payment?.direction ?? 'receipt',
  )
  const [partyId, setPartyId] = useState(payment?.partyId ?? '')
  const [date, setDate] = useState(payment?.date ?? dayjs().format('YYYY-MM-DD'))
  const [amount, setAmount] = useState(payment?.amount ?? '')
  const [method, setMethod] = useState<PaymentMethod>(
    payment?.method ?? 'bank_transfer',
  )
  const [cashAccountId, setCashAccountId] = useState(
    payment?.cashAccountId ?? '',
  )
  const [reference, setReference] = useState(payment?.reference ?? '')
  const [description, setDescription] = useState(payment?.description ?? '')
  const [idempotencyKey] = useState(
    () => payment?.idempotencyKey ?? crypto.randomUUID(),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!code.trim()) {
      setError('Vui lòng nhập số phiếu')
      return
    }
    if (!partyId) {
      setError(
        direction === 'receipt'
          ? 'Vui lòng chọn khách hàng'
          : 'Vui lòng chọn nhà cung cấp',
      )
      return
    }
    if (!date) {
      setError('Vui lòng chọn ngày phiếu')
      return
    }
    if (!(Number(amount) > 0)) {
      setError('Số tiền phải lớn hơn 0')
      return
    }
    if (method === 'other' && !cashAccountId) {
      setError('Phương thức "Khác" bắt buộc chọn tài khoản tiền')
      return
    }

    const payload: CreatePaymentPayload = {
      code: code.trim(),
      direction,
      partyId,
      date,
      amount: toMoneyString(amount),
      currency: 'VND',
      method,
      reference: reference.trim() || undefined,
      description: description.trim() || undefined,
      cashAccountId: cashAccountId || undefined,
      idempotencyKey: payment ? undefined : idempotencyKey,
    }

    setSaving(true)
    try {
      if (payment) {
        await updatePayment(payment.id, payload)
        toast.success('Đã cập nhật phiếu')
      } else {
        await createPayment(payload)
        toast.success('Đã tạo phiếu (nháp)')
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu phiếu thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const counterparties = parties.filter((party) =>
    direction === 'receipt' ? party.type !== 'vendor' : party.type !== 'customer',
  )
  const cashAccounts = accounts.filter(
    (account) =>
      account.isPostable &&
      account.isActive &&
      (account.code.startsWith('111') || account.code.startsWith('112')),
  )

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {payment
              ? `Sửa phiếu ${payment.code}`
              : 'Lập phiếu thu / phiếu chi'}
          </DialogTitle>
          <DialogDescription>
            Phiếu thu ghi Nợ 111/112 · Có 131; phiếu chi ghi Nợ 331 · Có 111/112
            khi được ghi sổ. Phân bổ vào hóa đơn làm sau, sau khi phiếu đã ghi sổ.
          </DialogDescription>
        </DialogHeader>

        <form
          id="payment-form"
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
              <Label htmlFor="payment-code">Số phiếu *</Label>
              <Input
                id="payment-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={direction === 'receipt' ? 'PT-2026-001' : 'PC-2026-001'}
              />
            </div>
            <div className="grid gap-2">
              <Label>Chiều phiếu *</Label>
              <Select
                value={direction}
                onValueChange={(value) => {
                  setDirection(value as PaymentDirection)
                  setPartyId('')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_DIRECTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PAYMENT_DIRECTION_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>
                {direction === 'receipt' ? 'Khách hàng *' : 'Nhà cung cấp *'}
              </Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn đối tượng" />
                </SelectTrigger>
                <SelectContent>
                  {counterparties.map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.code} — {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ngày phiếu *</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="payment-amount">Số tiền *</Label>
              <Input
                id="payment-amount"
                className="text-right tabular-nums"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Phương thức *</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as PaymentMethod)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PAYMENT_METHOD_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>
                Tài khoản tiền{' '}
                {method === 'other' ? '*' : '(bỏ trống = tự suy theo phương thức)'}
              </Label>
              <Select
                value={cashAccountId || '__auto__'}
                onValueChange={(value) =>
                  setCashAccountId(value === '__auto__' ? '' : value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Tự động (111/112)</SelectItem>
                  {cashAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} — {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-reference">Số tham chiếu</Label>
              <Input
                id="payment-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Số ủy nhiệm chi / giấy báo nợ"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payment-desc">Diễn giải</Label>
            <Textarea
              id="payment-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form="payment-form" disabled={saving}>
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
