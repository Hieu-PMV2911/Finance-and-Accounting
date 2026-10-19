import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { LoadingState } from '@/components/DataStates'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import type {
  AllocationTargetType,
  AgingLine,
  Payment,
  PaymentAllocation,
} from '@/types/api'
import { sumAmounts, subtractAmounts, toMoneyString } from '../documents/money'
import { fetchAging } from '../receivables/receivables.api'
import {
  allocatePayment,
  listPaymentAllocations,
  removeAllocation,
} from './payments.api'

interface AllocationDialogProps {
  payment: Payment
  onClose: () => void
}

/** Mảng ổn định khi chưa tải xong — tránh `useMemo` phụ thuộc giá trị mới mỗi render. */
const NO_ALLOCATIONS: PaymentAllocation[] = []

/** `'0.0000'` → `'0'` để ô nhập không hiện đuôi thập phân vô nghĩa. */
function inputValue(amount: string): string {
  const parsed = Number(amount)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

/**
 * Phân bổ phiếu thu/chi vào hóa đơn (mục 10.A).
 *
 * Đây là **lớp phân tích công nợ**, không sinh bút toán: bút toán của phiếu đã
 * đúng ở mức tổng. Chỉ phiếu **đã ghi sổ** mới phân bổ được, và mỗi cặp
 * (phiếu, hóa đơn) chỉ có **một** dòng — gửi lại là "đặt" số mới, không cộng dồn.
 *
 * Số còn lại của hóa đơn lấy từ báo cáo tuổi nợ (cùng nguồn với màn Công nợ),
 * nên hai màn hình không thể lệch nhau.
 */
export function AllocationDialog({ payment, onClose }: AllocationDialogProps) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const targetType: AllocationTargetType =
    payment.direction === 'receipt' ? 'sales_invoice' : 'vendor_bill'
  const agingKind = payment.direction === 'receipt' ? 'receivables' : 'payables'

  const allocationsQuery = useQuery({
    queryKey: ['payment-allocations', payment.id],
    queryFn: () => listPaymentAllocations(payment.id),
  })

  const agingQuery = useQuery({
    queryKey: ['aging', agingKind, { partyId: payment.partyId, settled: true }],
    queryFn: () =>
      fetchAging(agingKind, {
        partyId: payment.partyId,
        includeSettled: true,
      }),
  })

  const allocations = allocationsQuery.data ?? NO_ALLOCATIONS
  const allocationByTarget = useMemo(
    () => new Map(allocations.map((item) => [item.targetId, item])),
    [allocations],
  )

  const allocatedTotal = sumAmounts(allocations.map((item) => item.amount))
  const remainingOfPayment = subtractAmounts(payment.amount, allocatedTotal)

  /**
   * Giữ cả chứng từ đã tất toán **nếu** phiếu này đang phân bổ vào nó — nếu chỉ
   * lấy `outstanding > 0` thì dòng đã trả đủ biến mất và không gỡ được phân bổ.
   */
  const lines: AgingLine[] = (agingQuery.data?.lines ?? []).filter(
    (line) =>
      Number(line.outstanding) > 0 || allocationByTarget.has(line.targetId),
  )

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ['payment-allocations', payment.id],
    })
    queryClient.invalidateQueries({ queryKey: ['aging'] })
  }

  const allocate = useMutation({
    mutationFn: ({
      targetId,
      amount,
    }: {
      targetId: string
      amount: string
    }): Promise<PaymentAllocation> =>
      allocatePayment(payment.id, {
        targetType,
        targetId,
        amount: toMoneyString(amount),
      }),
    onSuccess: () => {
      toast.success('Đã cập nhật phân bổ')
      invalidate()
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'Phân bổ thất bại')),
  })

  const remove = useMutation({
    mutationFn: (allocationId: string) =>
      removeAllocation(payment.id, allocationId),
    onSuccess: () => {
      toast.success('Đã gỡ phân bổ')
      invalidate()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Gỡ thất bại')),
  })

  const saveRow = (line: AgingLine) => {
    const current = allocationByTarget.get(line.targetId)?.amount ?? '0'
    const raw = drafts[line.targetId] ?? inputValue(current)
    if (!(Number(raw) > 0)) {
      toast.error('Số tiền phân bổ phải lớn hơn 0')
      return
    }

    // Trần của dòng = số còn nợ + phần phiếu này đang giữ (đặt lại không trừ hai lần).
    const maxForTarget = sumAmounts([line.outstanding, current])
    if (Number(raw) > Number(maxForTarget)) {
      toast.error(
        `Vượt số còn lại của ${line.code}: tối đa ${formatMoney(maxForTarget)}`,
      )
      return
    }
    if (Number(raw) > Number(sumAmounts([remainingOfPayment, current]))) {
      toast.error(
        `Vượt số còn lại của phiếu: tối đa ${formatMoney(
          sumAmounts([remainingOfPayment, current]),
        )}`,
      )
      return
    }

    allocate.mutate({ targetId: line.targetId, amount: raw })
  }

  const loading = allocationsQuery.isLoading || agingQuery.isLoading
  const posted = payment.status === 'posted'

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Phân bổ phiếu <span className="font-mono">{payment.code}</span>
          </DialogTitle>
          <DialogDescription>
            {payment.party?.name ?? 'Đối tượng'} ·{' '}
            {formatMoney(payment.amount)} — chỉ phiếu đã ghi sổ mới phân bổ được.
          </DialogDescription>
        </DialogHeader>

        {!posted ? (
          <Alert>
            <AlertDescription>
              Phiếu chưa ở trạng thái “Đã ghi sổ” — hãy ghi sổ trước khi phân bổ
              công nợ.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs">Số tiền phiếu</p>
            <p className="font-medium tabular-nums">
              {formatMoney(payment.amount)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs">Đã phân bổ</p>
            <p className="font-medium tabular-nums">
              {formatMoney(allocatedTotal)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs">Còn lại</p>
            <p className="font-medium tabular-nums">
              {formatMoney(remainingOfPayment)}
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Đang tải công nợ…" />
        ) : agingQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {apiErrorMessage(agingQuery.error, 'Không tải được công nợ')}
            </AlertDescription>
          </Alert>
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Đối tượng này không còn chứng từ nào cần phân bổ.
          </p>
        ) : (
          <div className="max-h-[45vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chứng từ</TableHead>
                  <TableHead>Đến hạn</TableHead>
                  <TableHead className="text-right">Còn nợ</TableHead>
                  <TableHead className="text-right">Đang phân bổ</TableHead>
                  <TableHead className="w-[130px] text-right">Số tiền</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const existing = allocationByTarget.get(line.targetId)
                  const current = existing?.amount ?? '0'
                  const rowPending =
                    allocate.isPending &&
                    allocate.variables?.targetId === line.targetId
                  const inputId = `allocation-${line.targetId}`

                  return (
                    <TableRow key={line.targetId}>
                      <TableCell>
                        <span className="font-mono font-medium">{line.code}</span>
                        <span className="text-muted-foreground block text-xs">
                          {formatDate(line.date)}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(line.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(line.outstanding)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {existing ? formatMoney(current) : '—'}
                      </TableCell>
                      <TableCell>
                        <Input
                          id={inputId}
                          aria-label={`Số tiền phân bổ cho ${line.code}`}
                          className="text-right tabular-nums"
                          inputMode="decimal"
                          disabled={!posted}
                          value={
                            drafts[line.targetId] ?? inputValue(current)
                          }
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [line.targetId]: e.target.value,
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!posted || rowPending}
                            onClick={() => saveRow(line)}
                          >
                            {rowPending ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              'Đặt'
                            )}
                          </Button>
                          {existing ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`Gỡ phân bổ ${line.code}`}
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(existing.id)}
                            >
                              <Trash2 />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
