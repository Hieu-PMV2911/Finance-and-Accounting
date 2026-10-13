import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import type { FiscalPeriod } from '@/types/api'
import { fetchReconciliation } from './ledger.api'

interface ReconciliationPanelProps {
  periods: readonly FiscalPeriod[]
}

/**
 * Đối chiếu số dư: so bảng `account_balances` **đã lưu** với số dư **tái lập từ
 * bút toán** của một kỳ. `consistent = true` nghĩa là bảng số dư vẫn khớp hoàn
 * toàn với sổ bút toán — không có sai lệch tích lũy.
 *
 * Chỉ chạy theo kỳ (không dùng khoảng ngày) vì `account_balances` gắn với kỳ.
 */
export function ReconciliationPanel({ periods }: ReconciliationPanelProps) {
  const [periodId, setPeriodId] = useState('')
  // Kỳ mặc định: kỳ mới nhất — cùng quy ước với `defaultScope`.
  const effectivePeriodId = periodId || periods.at(-1)?.id || ''
  const selected = periods.find((item) => item.id === effectivePeriodId)

  const query = useQuery({
    queryKey: ['ledger', 'reconciliation', effectivePeriodId],
    queryFn: () => fetchReconciliation(effectivePeriodId),
    enabled: Boolean(effectivePeriodId),
  })

  const view = query.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={effectivePeriodId}
          onValueChange={setPeriodId}
          disabled={periods.length === 0}
        >
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Chọn kỳ kế toán" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((period) => (
              <SelectItem key={period.id} value={period.id}>
                {period.code} — {period.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={!effectivePeriodId || query.isFetching}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} />
          Đối chiếu lại
        </Button>
      </div>

      {periods.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Chưa có kỳ kế toán nào để đối chiếu." />
        </Card>
      ) : !effectivePeriodId ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Chọn một kỳ kế toán để đối chiếu số dư." />
        </Card>
      ) : query.isLoading ? (
        <Card className="gap-0 py-0">
          <TableLoading rows={4} cols={4} />
        </Card>
      ) : query.isError ? (
        <Card className="gap-0 py-0">
          <ErrorState message={apiErrorMessage(query.error)} />
        </Card>
      ) : !view ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Không có dữ liệu đối chiếu." />
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={
                    view.consistent
                      ? 'flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600'
                      : 'flex size-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600'
                  }
                >
                  {view.consistent ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <TriangleAlert className="size-5" />
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    {view.consistent
                      ? 'Số dư khớp hoàn toàn với bút toán'
                      : `Phát hiện ${view.differences.length} tài khoản lệch`}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Kỳ {view.periodCode} · {formatDate(view.periodStartDate)} →{' '}
                    {formatDate(view.periodEndDate)} · đã kiểm {view.checkedAccounts}{' '}
                    tài khoản
                  </p>
                </div>
              </div>

              <div className="text-muted-foreground text-right text-xs">
                <p>Đối chiếu lúc</p>
                <p className="text-foreground mt-0.5">
                  {formatDateTime(view.checkedAt)}
                </p>
                {selected ? <p className="mt-1">{selected.name}</p> : null}
              </div>
            </CardContent>
          </Card>

          {view.differences.length > 0 ? (
            <Card className="gap-0 overflow-hidden py-0">
              <div className="text-muted-foreground border-b px-4 py-3 text-sm">
                So sánh <span className="text-foreground font-medium">số dư đã lưu</span>{' '}
                với <span className="text-foreground font-medium">số dư tái lập từ bút toán</span>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead className="text-right">Dư đầu (lưu)</TableHead>
                      <TableHead className="text-right">Dư đầu (tái lập)</TableHead>
                      <TableHead className="text-right">PS Nợ (lưu)</TableHead>
                      <TableHead className="text-right">PS Nợ (tái lập)</TableHead>
                      <TableHead className="text-right">PS Có (lưu)</TableHead>
                      <TableHead className="text-right">PS Có (tái lập)</TableHead>
                      <TableHead>Trường lệch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.differences.map((row) => (
                      <TableRow key={row.accountId}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono text-sm font-semibold">
                            {row.accountCode}
                          </span>
                          <span className="text-muted-foreground ml-2 text-sm">
                            {row.accountName}
                          </span>
                        </TableCell>
                        <DiffCell
                          stored={row.storedOpeningNet}
                          computed={row.computedOpeningNet}
                        />
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(row.computedOpeningNet)}
                        </TableCell>
                        <DiffCell
                          stored={row.storedDebitTotal}
                          computed={row.computedDebitTotal}
                        />
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(row.computedDebitTotal)}
                        </TableCell>
                        <DiffCell
                          stored={row.storedCreditTotal}
                          computed={row.computedCreditTotal}
                        />
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(row.computedCreditTotal)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.mismatched.map((field) => (
                              <Badge
                                key={field}
                                variant="outline"
                                className="border-rose-200 bg-rose-50 text-rose-700"
                              >
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

/** Ô "số dư đã lưu" — tô đỏ khi lệch với số tái lập. */
function DiffCell({ stored, computed }: { stored: string; computed: string }) {
  const mismatch = formatMoney(stored) !== formatMoney(computed)
  return (
    <TableCell
      className={`text-right font-mono text-sm tabular-nums ${
        mismatch ? 'text-destructive font-semibold' : ''
      }`}
    >
      {formatMoney(stored)}
    </TableCell>
  )
}
