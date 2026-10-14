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
import { apiErrorMessage } from '@/lib/api'
import {
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENT_TYPES,
  type WebhookEndpoint,
  type WebhookEventType,
} from '@/types/api'
import { createWebhookEndpoint, updateWebhookEndpoint } from './webhooks.api'

const schema = z.object({
  name: z.string().min(2, 'Tên tối thiểu 2 ký tự').max(120, 'Tên tối đa 120 ký tự'),
  url: z
    .string()
    .min(1, 'Vui lòng nhập URL')
    .refine(
      (value) => /^https?:\/\/.+/i.test(value),
      'URL phải bắt đầu bằng http:// hoặc https://',
    ),
  secret: z
    .string()
    .refine(
      (value) => value === '' || value.length >= 16,
      'Khóa ký tối thiểu 16 ký tự',
    ),
})

interface WebhookEndpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` = tạo mới, ngược lại là sửa. */
  endpoint: WebhookEndpoint | null
  onSaved: () => void
}

/**
 * Dialog đăng ký / sửa endpoint nhận webhook.
 *
 * Khóa ký (secret) **chỉ gửi lên**, backend không bao giờ trả về — nên khi sửa,
 * ô khóa để trống nghĩa là "giữ nguyên khóa cũ". Bỏ trống khi tạo mới thì backend
 * tự sinh khóa cho endpoint.
 */
export function WebhookEndpointDialog({
  open,
  onOpenChange,
  endpoint,
  onSaved,
}: WebhookEndpointDialogProps) {
  const [name, setName] = useState(endpoint?.name ?? '')
  const [url, setUrl] = useState(endpoint?.url ?? '')
  const [secret, setSecret] = useState('')
  const [isActive, setIsActive] = useState(endpoint?.isActive ?? true)
  const [events, setEvents] = useState<WebhookEventType[]>(endpoint?.events ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleEvent = (event: WebhookEventType, checked: boolean) => {
    setEvents((current) =>
      checked ? [...current, event] : current.filter((item) => item !== event),
    )
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const parsed = schema.safeParse({ name, url, secret })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
      return
    }

    setSaving(true)
    try {
      if (endpoint) {
        await updateWebhookEndpoint(endpoint.id, {
          name: parsed.data.name.trim(),
          url: parsed.data.url.trim(),
          isActive,
          events,
          ...(parsed.data.secret ? { secret: parsed.data.secret } : {}),
        })
        toast.success(`Đã cập nhật endpoint "${parsed.data.name.trim()}"`)
      } else {
        await createWebhookEndpoint({
          name: parsed.data.name.trim(),
          url: parsed.data.url.trim(),
          isActive,
          events,
          ...(parsed.data.secret ? { secret: parsed.data.secret } : {}),
        })
        toast.success(`Đã tạo endpoint "${parsed.data.name.trim()}"`)
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu endpoint thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {endpoint ? `Sửa endpoint ${endpoint.name}` : 'Thêm endpoint nhận webhook'}
          </DialogTitle>
          <DialogDescription>
            Payload được ký HMAC-SHA256 và gửi kèm header{' '}
            <code className="font-mono text-xs">x-webhook-signature</code> dạng{' '}
            <code className="font-mono text-xs">sha256=&lt;hex&gt;</code>. Job giao
            webhook tự thử lại theo backoff khi endpoint lỗi.
          </DialogDescription>
        </DialogHeader>

        <form id="webhook-endpoint-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="endpoint-name">Tên endpoint *</Label>
            <Input
              id="endpoint-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Hệ thống thanh toán"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endpoint-url">URL nhận webhook *</Label>
            <Input
              id="endpoint-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://payments.example.com/hooks/ledger"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endpoint-secret">
              Khóa ký HMAC {endpoint ? '(bỏ trống = giữ nguyên)' : '(bỏ trống = tự sinh)'}
            </Label>
            <Input
              id="endpoint-secret"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Tối thiểu 16 ký tự"
            />
          </div>

          <div className="grid gap-2">
            <Label>Sự kiện đăng ký</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENT_TYPES.map((item) => (
                <label
                  key={item}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`event-${item}`}
                >
                  <Checkbox
                    id={`event-${item}`}
                    checked={events.includes(item)}
                    onCheckedChange={(checked) => toggleEvent(item, checked === true)}
                  />
                  {WEBHOOK_EVENT_LABELS[item]}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Không chọn sự kiện nào ⇒ endpoint nhận <strong>mọi</strong> sự kiện.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm" htmlFor="endpoint-active">
            <Checkbox
              id="endpoint-active"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            Đang hoạt động
          </label>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="webhook-endpoint-form" disabled={saving}>
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
