import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, TriangleAlert } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { ScopePicker } from '@/components/ScopePicker'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { isScopeReady } from '@/lib/scope'
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
  type FiscalPeriod,
  type ReportScope,
} from '@/types/api'
import { fetchTrialBalance } from './ledger.api'

const TYPE_BADGE: Record<AccountType, string> = {
  asset: 'border-blue-200 bg-blue-50 text-blue-700',
  liability: 'border-amber-200 bg-amber-50 text-amber-700',
  equity: 'border-violet-200 bg-violet-50 text-violet-700',
  revenue: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expense: 'border-rose-200 bg-rose-50 text-rose-700',
}

interface TrialBalancePanelProps {
  periods: readonly FiscalPeriod[]
  scope: ReportScope
  onScopeChange: (next: ReportScope) => void
}

/**
 * Bảng cân đối số phát sinh: dư đầu kỳ, phát sinh Nợ/Có và dư cuối kỳ của **mọi**
 * tài khoản. Cờ `balanced` xác nhận Σ dư cuối Nợ = Σ dư cuối Có — nếu lệch thì
 * dữ liệu bút toán đã sai ở đâu đó.
 */
export function TrialBalancePanel({
  periods,
  scope,
  onScopeChange,
}: TrialBalancePanelProps) {
  const ready = isScopeReady(scope)
  const query = useQuery({
    queryKey: ['ledger', 'trial-balance', scope],
    queryFn: () => fetchTrialBalance(scope),
    enabled: ready,
  })

  const view = query.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopePicker periods={periods} value={scope} onChange={onScopeChange} />

        {view ? (
          <Badge
            variant="outline"
            className={
              view.balanced
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }
          >
            {view.balanced ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <TriangleAlert className="size-3.5" />
            )}
            {view.balanced ? 'Cân đối' : 'Lệch — kiểm tra lại bút toán'}
          </Badge>
        ) : null}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {!ready ? (
          <EmptyState message="Chọn đủ phạm vi (kỳ hoặc khoảng ngày) để xem bảng cân đối." />
        ) : query.isLoading ? (
          <TableLoading cols={8} />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : !view || view.rows.length === 0 ? (
          <EmptyState message="Không có số dư nào trong phạm vi đã chọn." />
        ) : (
          <>
            <div className="text-muted-foreground border-b px-4 py-3 text-sm">
              {view.periodCode ? `Kỳ ${view.periodCode} · ` : ''}
              {formatDate(view.fromDate)} → {formatDate(view.toDate)} ·{' '}
              {view.rows.length} tài khoản
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tài khoản</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead className="text-right">Dư đầu Nợ</TableHead>
                    <TableHead className="text-right">Dư đầu Có</TableHead>
                    <TableHead className="text-right">PS Nợ</TableHead>
                    <TableHead className="text-right">PS Có</TableHead>
                    <TableHead className="text-right">Dư cuối Nợ</TableHead>
                    <TableHead className="text-right">Dư cuối Có</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-mono text-sm font-semibold">
                          {row.accountCode}
                        </span>
                        <span className="text-muted-foreground ml-2 text-sm">
                          {row.accountName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={TYPE_BADGE[row.accountType]}
                        >
                          {ACCOUNT_TYPE_LABELS[row.accountType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(row.openingDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(row.openingCredit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(row.debitTotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(row.creditTotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(row.closingDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(row.closingCredit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Tổng cộng</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(view.totals.openingDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(view.totals.openingCredit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(view.totals.debitTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(view.totals.creditTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(view.totals.closingDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(view.totals.closingCredit)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
