import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage } from '@/lib/api'
import { formatDateInput, formatMoney } from '@/lib/format'
import {
  fromMinor,
  isValidMoneyInput,
  isPositiveMoney,
  sumMinor,
  toMinor,
} from '@/lib/money'
import type {
  CreateJournalEntryPayload,
  CreateJournalLinePayload,
  JournalEntry,
  UpdateJournalEntryPayload,
} from '@/types/api'
import { listAccounts } from '../accounts/accounts.api'
import { listFiscalPeriods } from '../periods/periods.api'
import { createJournal, updateJournal } from './journals.api'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface DraftLine {
  key: string
  accountId: string
  debit: string
  credit: string
  description: string
}

let lineKeySeed = 0
function newLineKey(): string {
  lineKeySeed += 1
  return `line-${lineKeySeed}`
}

function emptyLine(): DraftLine {
  return {
    key: newLineKey(),
    accountId: '',
    debit: '',
    credit: '',
    description: '',
  }
}

/** Khóa chống ghi trùng — sinh một lần cho mỗi lần mở modal tạo mới. */
function createIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return `je-${random}`
  return `je-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

interface JournalFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = tạo mới, ngược lại là sửa bút toán nháp. */
  entry: JournalEntry | null
  onSaved: () => void
}

/**
 * Dialog lập/sửa bút toán nháp.
 *
 * Kiểm tra cân bằng Nợ = Có ngay trên UI để người dùng thấy lỗi sớm, nhưng
 * **backend vẫn kiểm tra lại** — không bao giờ tin frontend (bất biến số 1).
 * Số tiền giữ nguyên dạng chuỗi và tính bằng `BigInt` (`@/lib/money`), không
 * dùng float.
 */
export function JournalFormModal({
  open,
  onOpenChange,
  entry,
  onSaved,
}: JournalFormModalProps) {
  const [date, setDate] = useState(() =>
    entry ? formatDateInput(entry.date) : dayjs().format('YYYY-MM-DD'),
  )
  const [description, setDescription] = useState(entry?.description ?? '')
  const [reference, setReference] = useState(entry?.reference ?? '')
  const [lines, setLines] = useState<DraftLine[]>(() =>
    entry
      ? entry.lines.map((line) => ({
          key: newLineKey(),
          accountId: line.accountId,
          debit: toMinor(line.debit) > 0n ? line.debit : '',
          credit: toMinor(line.credit) > 0n ? line.credit : '',
          description: line.description ?? '',
        }))
      : [emptyLine(), emptyLine()],
  )
  const [idempotencyKey] = useState(() => createIdempotencyKey())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const accountsQuery = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: async () => {
      const accounts = await listAccounts({ isActive: true })
      return accounts.filter((account) => account.isPostable)
    },
  })
  const postableAccounts = accountsQuery.data ?? []

  // Cảnh báo sớm khi ngày hạch toán rơi ra ngoài mọi kỳ đang mở — backend sẽ
  // từ chối, nhưng hiển thị ngay ở đây thì người dùng hiểu vấn đề tức thì.
  const openPeriodsQuery = useQuery({
    queryKey: ['fiscal-periods', 'open'],
    queryFn: () => listFiscalPeriods({ status: 'open' }),
  })
  const coveredPeriod = (openPeriodsQuery.data ?? []).find(
    (period) => period.startDate <= date && date <= period.endDate,
  )
  const showPeriodWarning =
    DATE_PATTERN.test(date) && openPeriodsQuery.isSuccess && !coveredPeriod

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  /** Mỗi dòng chỉ ghi một bên — nhập bên này thì xóa bên kia. */
  const setAmount = (key: string, side: 'debit' | 'credit', value: string) => {
    updateLine(key, {
      [side]: value,
      [side === 'debit' ? 'credit' : 'debit']: '',
    } as Partial<DraftLine>)
  }

  const addLine = () => setLines((current) => [...current, emptyLine()])

  const removeLine = (key: string) => {
    setLines((current) =>
      current.length <= 2
        ? current
        : current.filter((line) => line.key !== key),
    )
  }

  const filledLines = lines.filter(
    (line) => line.accountId || line.debit.trim() || line.credit.trim(),
  )
  const totalDebitMinor = sumMinor(
    lines.map((line) => (isValidMoneyInput(line.debit) ? line.debit : '0')),
  )
  const totalCreditMinor = sumMinor(
    lines.map((line) => (isValidMoneyInput(line.credit) ? line.credit : '0')),
  )
  const difference = totalDebitMinor - totalCreditMinor
  const isBalanced = difference === 0n && totalDebitMinor > 0n

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!DATE_PATTERN.test(date)) {
      setError('Vui lòng chọn ngày hạch toán')
      return
    }
    const trimmedDescription = description.trim()
    if (!trimmedDescription) {
      setError('Vui lòng nhập diễn giải bút toán')
      return
    }
    if (trimmedDescription.length > 500) {
      setError('Diễn giải tối đa 500 ký tự')
      return
    }
    if (reference.trim().length > 64) {
      setError('Số chứng từ gốc tối đa 64 ký tự')
      return
    }

    if (filledLines.length < 2) {
      setError('Bút toán phải có tối thiểu 2 dòng định khoản')
      return
    }

    const payloadLines: CreateJournalLinePayload[] = []
    for (const [index, line] of filledLines.entries()) {
      const position = index + 1
      if (!line.accountId) {
        setError(`Dòng ${position}: vui lòng chọn tài khoản`)
        return
      }
      const debit = line.debit.trim()
      const credit = line.credit.trim()
      if (!isValidMoneyInput(debit) || !isValidMoneyInput(credit)) {
        setError(
          `Dòng ${position}: số tiền không hợp lệ (tối đa 15 chữ số nguyên và 4 chữ số thập phân)`,
        )
        return
      }
      const hasDebit = isPositiveMoney(debit)
      const hasCredit = isPositiveMoney(credit)
      if (hasDebit === hasCredit) {
        setError(
          `Dòng ${position}: mỗi dòng chỉ được ghi Nợ hoặc Có, và số tiền phải lớn hơn 0`,
        )
        return
      }
      payloadLines.push({
        accountId: line.accountId,
        debit: hasDebit ? debit : undefined,
        credit: hasCredit ? credit : undefined,
        description: line.description.trim() || undefined,
      })
    }

    const debitMinor = sumMinor(payloadLines.map((line) => line.debit))
    const creditMinor = sumMinor(payloadLines.map((line) => line.credit))
    if (debitMinor <= 0n) {
      setError('Tổng phát sinh Nợ phải lớn hơn 0')
      return
    }
    if (debitMinor !== creditMinor) {
      setError(
        `Bút toán không cân bằng: tổng Nợ ${formatMoney(
          fromMinor(debitMinor),
        )} ≠ tổng Có ${formatMoney(fromMinor(creditMinor))}`,
      )
      return
    }

    setSaving(true)
    try {
      if (entry) {
        const payload: UpdateJournalEntryPayload = {
          date,
          description: trimmedDescription,
          reference: reference.trim() || null,
          lines: payloadLines,
        }
        await updateJournal(entry.id, payload)
        toast.success('Đã cập nhật bút toán nháp')
      } else {
        const payload: CreateJournalEntryPayload = {
          date,
          description: trimmedDescription,
          reference: reference.trim() || undefined,
          idempotencyKey,
          lines: payloadLines,
        }
        const created = await createJournal(payload)
        toast.success(
          `Đã lập bút toán nháp ${created.id.slice(0, 8)} — ${formatMoney(
            created.totalDebit,
          )}`,
        )
      }
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Lưu bút toán thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? 'Sửa bút toán nháp' : 'Lập bút toán'}
          </DialogTitle>
          <DialogDescription>
            Kỳ kế toán được xác định theo ngày hạch toán. Chỉ tài khoản lá đang
            hoạt động mới ghi sổ được; mỗi dòng chỉ nhập một bên Nợ hoặc Có.
          </DialogDescription>
        </DialogHeader>

        <form id="journal-form" className="grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {showPeriodWarning ? (
            <Alert>
              <AlertDescription>
                Ngày hạch toán không thuộc kỳ kế toán nào đang mở — bút toán sẽ
                bị từ chối khi lưu. Hãy chọn ngày trong một kỳ đang mở.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="journal-date">Ngày hạch toán *</Label>
              <DatePicker
                id="journal-date"
                className="w-full"
                value={date}
                onChange={setDate}
                placeholder="Chọn ngày"
              />
              {coveredPeriod ? (
                <p className="text-muted-foreground text-xs">
                  Thuộc kỳ <span className="text-foreground font-medium">{coveredPeriod.code}</span>
                </p>
              ) : null}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="journal-description">Diễn giải *</Label>
              <Input
                id="journal-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Bán hàng cho khách A"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="journal-reference">Số chứng từ gốc</Label>
            <Input
              id="journal-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="HD-2026-001"
            />
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label>Dòng định khoản *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus />
                Thêm dòng
              </Button>
            </div>

            <div className="text-muted-foreground hidden gap-2 px-1 text-xs sm:grid sm:grid-cols-12">
              <span className="col-span-4">Tài khoản</span>
              <span className="col-span-2">Nợ</span>
              <span className="col-span-2">Có</span>
              <span className="col-span-3">Diễn giải dòng</span>
              <span className="col-span-1" />
            </div>

            <div className="grid gap-2">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="grid grid-cols-12 items-start gap-2 rounded-lg border p-2"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <Select
                      value={line.accountId}
                      onValueChange={(value) =>
                        updateLine(line.key, { accountId: value })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Dòng ${index + 1} — tài khoản`}
                      >
                        <SelectValue
                          placeholder={`Dòng ${index + 1}: chọn tài khoản`}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {postableAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <Input
                      id={`journal-line-${index}-debit`}
                      aria-label={`Dòng ${index + 1} — số tiền ghi Nợ`}
                      className="text-right font-mono tabular-nums"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.debit}
                      onChange={(event) =>
                        setAmount(line.key, 'debit', event.target.value)
                      }
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <Input
                      id={`journal-line-${index}-credit`}
                      aria-label={`Dòng ${index + 1} — số tiền ghi Có`}
                      className="text-right font-mono tabular-nums"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.credit}
                      onChange={(event) =>
                        setAmount(line.key, 'credit', event.target.value)
                      }
                    />
                  </div>

                  <div className="col-span-10 sm:col-span-3">
                    <Input
                      id={`journal-line-${index}-description`}
                      aria-label={`Dòng ${index + 1} — diễn giải`}
                      placeholder="Diễn giải dòng"
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.key, { description: event.target.value })
                      }
                    />
                  </div>

                  <div className="col-span-2 flex justify-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2 />
                      <span className="sr-only">Xóa dòng {index + 1}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span className="flex flex-wrap items-center gap-4">
              <span>
                Tổng Nợ:{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {formatMoney(fromMinor(totalDebitMinor))}
                </span>
              </span>
              <span>
                Tổng Có:{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {formatMoney(fromMinor(totalCreditMinor))}
                </span>
              </span>
            </span>
            {isBalanced ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Cân bằng
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-rose-200 bg-rose-50 text-rose-700"
              >
                Lệch{' '}
                {formatMoney(
                  fromMinor(difference < 0n ? -difference : difference),
                )}
              </Badge>
            )}
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
          <Button type="submit" form="journal-form" disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang lưu…
              </>
            ) : (
              'Lưu nháp'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
