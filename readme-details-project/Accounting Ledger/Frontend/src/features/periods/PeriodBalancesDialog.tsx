import { useQuery } from '@tanstack/react-query'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { sumMoney } from '@/lib/money'
import {
  ACCOUNT_TYPE_LABELS,
  type AccountBalance,
  type AccountType,
  type FiscalPeriod,
} from '@/types/api'
import { fetchPeriodBalances } from './periods.api'

const TYPE_BADGE: Record<AccountType, string> = {
  asset: 'border-blue-200 bg-blue-50 text-blue-700',
  liability: 'border-amber-200 bg-amber-50 text-amber-700',
  equity: 'border-violet-200 bg-violet-50 text-violet-700',
  revenue: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expense: 'border-rose-200 bg-rose-50 text-rose-700',
}

interface PeriodBalancesDialogProps {
  period: FiscalPeriod | null
  onOpenChange: (open: boolean) => void
}

/**
 * Số dư tài khoản trong kỳ: dư đầu kỳ, phát sinh, dư cuối kỳ.
 *
 * Dư cuối kỳ là **số dư thuần** `(Nợ đầu − Có đầu) + (Nợ PS − Có PS)` do
 * backend tính sẵn, nên tài khoản bị đảo (Nợ = Có) sẽ triệt tiêu về 0.
 */
export function PeriodBalancesDialog({
  period,
  onOpenChange,
}: PeriodBalancesDialogProps) {
  const balancesQuery = useQuery({
    queryKey: ['fiscal-periods', period?.id, 'balances'],
    queryFn: () => fetchPeriodBalances(period!.id),
    enabled: Boolean(period),
  })

  const rows: AccountBalance[] = balancesQuery.data ?? []
  const totals = {
    openingDebit: sumMoney(rows.map((row) => row.openingDebit)),
    openingCredit: sumMoney(rows.map((row) => row.openingCredit)),
    debitTotal: sumMoney(rows.map((row) => row.debitTotal)),
    creditTotal: sumMoney(rows.map((row) => row.creditTotal)),
    closingDebit: sumMoney(rows.map((row) => row.closingDebit)),
    closingCredit: sumMoney(rows.map((row) => row.closingCredit)),
  }

  return (
    <Dialog open={Boolean(period)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Số dư kỳ {period?.code}
            {period ? ` — ${period.name}` : ''}
          </DialogTitle>
          <DialogDescription>
            {period
              ? `${formatDate(period.startDate)} → ${formatDate(period.endDate)} · ${rows.length} tài khoản có số dư`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {balancesQuery.isLoading ? (
          <TableLoading rows={6} cols={8} />
        ) : balancesQuery.isError ? (
          <ErrorState message={apiErrorMessage(balancesQuery.error)} />
        ) : rows.length === 0 ? (
          <EmptyState message="Kỳ này chưa phát sinh số dư nào." />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
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
                {rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      <span className="font-mono text-sm font-semibold">
                        {row.accountCode}
                      </span>
                      <span className="text-muted-foreground ml-2 text-sm">
                        {row.accountName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_BADGE[row.accountType]}>
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
                    {formatMoney(totals.openingDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(totals.openingCredit)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(totals.debitTotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(totals.creditTotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(totals.closingDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(totals.closingCredit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
