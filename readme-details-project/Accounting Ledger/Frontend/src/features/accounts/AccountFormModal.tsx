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
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountLike,
  type AccountType,
} from '@/types/api'
import { createAccount, updateAccount } from './accounts.api'

const ROOT_PARENT = '__root__'

const schema = z.object({
  code: z.string().min(1, 'Vui lòng nhập mã tài khoản').max(32, 'Tối đa 32 ký tự'),
  name: z.string().min(1, 'Vui lòng nhập tên tài khoản').max(255, 'Tối đa 255 ký tự'),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  description: z.string().max(1000, 'Tối đa 1000 ký tự'),
})

interface AccountFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = tạo mới, ngược lại là sửa. */
  account: AccountLike | null
  presetParentId: string | null
  accounts: Account[]
  onSaved: () => void
}

/**
 * Dialog thêm/sửa tài khoản.
 *
 * Cha truyền `key` thay đổi mỗi lần mở (xem AccountsPage) để component được
 * mount lại với giá trị khởi tạo đúng — tránh phải đồng bộ state bằng effect.
 */
export function AccountFormModal({
  open,
  onOpenChange,
  account,
  presetParentId,
  accounts,
  onSaved,
}: AccountFormModalProps) {
  const initialParent = presetParentId
    ? accounts.find((item) => item.id === presetParentId)
    : undefined

  const [code, setCode] = useState(account?.code ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(
    account?.type ?? initialParent?.type ?? 'asset',
  )
  const [parentId, setParentId] = useState(
    account?.parentId ?? presetParentId ?? '',
  )
  const [description, setDescription] = useState(account?.description ?? '')
  const [isActive, setIsActive] = useState(account?.isActive ?? true)
  const [isPostable, setIsPostable] = useState(account?.isPostable ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Loại tài khoản con phải trùng loại cha → tự đồng bộ khi chọn cha.
  const handleParentChange = (value: string) => {
    const next = value === ROOT_PARENT ? '' : value
    setParentId(next)
    const parent = accounts.find((item) => item.id === next)
    if (parent) {
      setType(parent.type)
    }
  }

  const parentOptions = accounts.filter((item) => item.id !== account?.id)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const parsed = schema.safeParse({ code, name, type, description })
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
        parentId: parentId || null,
        description: parsed.data.description.trim() || undefined,
        isActive,
        isPostable,
      }

      if (account) {
        await updateAccount(account.id, payload)
        toast.success(`Đã cập nhật tài khoản ${payload.code}`)
      } else {
        await createAccount(payload)
        toast.success(`Đã tạo tài khoản ${payload.code}`)
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu tài khoản thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {account ? `Sửa tài khoản ${account.code}` : 'Thêm tài khoản'}
          </DialogTitle>
          <DialogDescription>
            Chỉ tài khoản lá mới được ghi sổ. Tài khoản con phải cùng loại với
            tài khoản cha.
          </DialogDescription>
        </DialogHeader>

        <form id="account-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account-code">Mã tài khoản *</Label>
              <Input
                id="account-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="1111"
              />
            </div>

            <div className="grid gap-2">
              <Label>Loại tài khoản *</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as AccountType)}
                disabled={Boolean(parentId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn loại" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {ACCOUNT_TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="account-name">Tên tài khoản *</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tiền mặt Việt Nam Đồng"
            />
          </div>

          <div className="grid gap-2">
            <Label>Tài khoản cha</Label>
            <Select
              value={parentId || ROOT_PARENT}
              onValueChange={handleParentChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn tài khoản cha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_PARENT}>
                  — Không (tài khoản gốc) —
                </SelectItem>
                {parentOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} — {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Chọn cha thì loại tài khoản tự đồng bộ theo cha.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="account-description">Mô tả</Label>
            <Textarea
              id="account-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="account-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <Label htmlFor="account-active" className="font-normal">
                Đang hoạt động
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="account-postable"
                checked={isPostable}
                onCheckedChange={(checked) => setIsPostable(checked === true)}
              />
              <Label htmlFor="account-postable" className="font-normal">
                Cho phép ghi sổ
              </Label>
            </div>
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
          <Button type="submit" form="account-form" disabled={saving}>
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
