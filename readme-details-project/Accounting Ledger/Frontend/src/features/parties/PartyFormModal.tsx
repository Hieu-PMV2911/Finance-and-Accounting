import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  PARTY_TYPES,
  PARTY_TYPE_LABELS,
  type Party,
  type PartyType,
} from '@/types/api'
import { createParty, updateParty } from './parties.api'

const schema = z.object({
  code: z.string().min(1, 'Vui lòng nhập mã đối tượng').max(32, 'Tối đa 32 ký tự'),
  name: z.string().min(1, 'Vui lòng nhập tên đối tượng').max(255, 'Tối đa 255 ký tự'),
  type: z.enum(['customer', 'vendor', 'both']),
  taxCode: z.string().max(32, 'Tối đa 32 ký tự').optional().or(z.literal('')),
  contactEmail: z.string().email('Email không hợp lệ').max(255).optional().or(z.literal('')),
  paymentTermDays: z.coerce.number().int().min(0).max(3650).optional(),
  creditLimit: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Số tiền không hợp lệ').optional().or(z.literal('')),
})

interface PartyFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  party: Party | null
  onSaved: () => void
}

export function PartyFormModal({
  open,
  onOpenChange,
  party,
  onSaved,
}: PartyFormModalProps) {
  const [code, setCode] = useState(party?.code ?? '')
  const [name, setName] = useState(party?.name ?? '')
  const [type, setType] = useState<PartyType>(party?.type ?? 'customer')
  const [taxCode, setTaxCode] = useState(party?.taxCode ?? '')
  const [address, setAddress] = useState(party?.address ?? '')
  const [contactName, setContactName] = useState(party?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(party?.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(party?.contactEmail ?? '')
  const [paymentTermDays, setPaymentTermDays] = useState(
    party?.paymentTermDays?.toString() ?? '30',
  )
  const [creditLimit, setCreditLimit] = useState(party?.creditLimit ?? '')
  const [isActive, setIsActive] = useState(party?.isActive ?? true)
  const [description, setDescription] = useState(party?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const parsed = schema.safeParse({
      code,
      name,
      type,
      taxCode,
      contactEmail,
      paymentTermDays: paymentTermDays ? Number(paymentTermDays) : undefined,
      creditLimit,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
      return
    }

    setSaving(true)
    try {
      const payload = {
        code: parsed.data.code.trim(),
        name: parsed.data.name.trim(),
        type: parsed.data.type,
        taxCode: taxCode.trim() || undefined,
        address: address.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        paymentTermDays: parsed.data.paymentTermDays,
        creditLimit: creditLimit.trim() || undefined,
        isActive,
        description: description.trim() || undefined,
      }

      if (party) {
        await updateParty(party.id, payload)
        toast.success('Đã cập nhật đối tượng')
      } else {
        await createParty(payload)
        toast.success('Đã tạo đối tượng')
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {party ? `Sửa đối tượng ${party.code}` : 'Thêm đối tượng'}
          </DialogTitle>
          <DialogDescription>
            Đối tượng dùng cho sổ cái phụ (phải thu / phải trả).
          </DialogDescription>
        </DialogHeader>

        <form id="party-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="party-code">Mã *</Label>
              <Input
                id="party-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Loại *</Label>
              <Select value={type} onValueChange={(v) => setType(v as PartyType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PARTY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-name">Tên *</Label>
            <Input
              id="party-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="party-tax">Mã số thuế</Label>
              <Input
                id="party-tax"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-term">Số ngày được nợ</Label>
              <Input
                id="party-term"
                type="number"
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-address">Địa chỉ</Label>
            <Input
              id="party-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="party-contact">Người liên hệ</Label>
              <Input
                id="party-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-phone">Điện thoại</Label>
              <Input
                id="party-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="party-email">Email</Label>
              <Input
                id="party-email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-limit">Hạn mức công nợ</Label>
              <Input
                id="party-limit"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-desc">Mô tả</Label>
            <Textarea
              id="party-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="party-active"
              checked={isActive}
              onCheckedChange={(c) => setIsActive(c === true)}
            />
            <Label htmlFor="party-active" className="font-normal">
              Đang hoạt động
            </Label>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="party-form" disabled={saving}>
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
