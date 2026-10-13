import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { ScopePicker } from '@/components/ScopePicker'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { isScopeReady, scopeLabel } from '@/lib/scope'
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
  type FiscalPeriod,
  type ReportScope,
} from '@/types/api'
import { listAccounts } from '../accounts/accounts.api'
import { fetchGeneralLedger } from './ledger.api'

const TYPE_BADGE: Record<AccountType, string> = {
  asset: 'border-blue-200 bg-blue-50 text-blue-700',
  liability: 'border-amber-200 bg-amber-50 text-amber-700',
  equity: 'border-violet-200 bg-violet-50 text-violet-700',
  revenue: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expense: 'border-rose-200 bg-rose-50 text-rose-700',
}

interface GeneralLedgerPanelProps {
  periods: readonly FiscalPeriod[]
  scope: ReportScope
  onScopeChange: (next: ReportScope) => void
}

/**
 * Sổ cái chi tiết của một tài khoản: dư đầu kỳ → từng dòng phát sinh (kèm **số
 * dư lũy kế** sau mỗi dòng) → dư cuối kỳ. Bất biến luôn đúng:
 * `dư cuối = dư đầu + Σ(Nợ) − Σ(Có)`.
 */
export function GeneralLedgerPanel({
  periods,
  scope,
  onScopeChange,
}: GeneralLedgerPanelProps) {
  const accountsQuery = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => listAccounts(),
  })
  const accounts = accountsQuery.data ?? []

  const [accountId, setAccountId] = useState('')
  // Tài khoản mặc định: ưu tiên tài khoản lá (nơi thực sự phát sinh bút toán).
  const effectiveAccountId =
    accountId || accounts.find((item) => item.isPostable)?.id || accounts[0]?.id || ''

  const ready = Boolean(effectiveAccountId) && isScopeReady(scope)
  const ledgerQuery = useQuery({
    queryKey: ['ledger', 'general-ledger', effectiveAccountId, scope],
    queryFn: () =>
      fetchGeneralLedger({ accountId: effectiveAccountId, ...scope }),
    enabled: ready,
  })

  const ledger = ledgerQuery.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={effectiveAccountId}
          onValueChange={setAccountId}
          disabled={accountsQuery.isLoading || accounts.length === 0}
        >
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Chọn tài khoản" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.code} — {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ScopePicker periods={periods} value={scope} onChange={onScopeChange} />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {accountsQuery.isError ? (
          <ErrorState message={apiErrorMessage(accountsQuery.error)} />
        ) : accounts.length === 0 ? (
          <EmptyState message="Chưa có tài khoản kế toán nào." />
        ) : !ready ? (
          <EmptyState message="Chọn đủ phạm vi (kỳ hoặc khoảng ngày) để xem sổ cái." />
        ) : ledgerQuery.isLoading ? (
          <TableLoading cols={8} />
        ) : ledgerQuery.isError ? (
          <ErrorState message={apiErrorMessage(ledgerQuery.error)} />
        ) : !ledger ? (
          <EmptyState message="Không có dữ liệu." />
        ) : (
          <>
            <CardHeader className="border-b">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{ledger.accountCode}</span>
                {ledger.accountName}
                <Badge variant="outline" className={TYPE_BADGE[ledger.accountType]}>
                  {ACCOUNT_TYPE_LABELS[ledger.accountType]}
                </Badge>
              </CardTitle>
              <CardDescription>
                {scopeLabel(scope, ledger.periodCode)} · {formatDate(ledger.fromDate)} →{' '}
                {formatDate(ledger.toDate)} · {ledger.lines.length} dòng phát sinh
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-4 py-4 sm:grid-cols-3">
              <SummaryTile
                label="Dư đầu kỳ"
                debit={ledger.openingDebit}
                credit={ledger.openingCredit}
              />
              <SummaryTile
                label="Phát sinh trong kỳ"
                debit={ledger.totalDebit}
                credit={ledger.totalCredit}
              />
              <SummaryTile
                label="Dư cuối kỳ"
                debit={ledger.closingDebit}
                credit={ledger.closingCredit}
                emphasized
              />
            </CardContent>

            {ledger.lines.length === 0 ? (
              <EmptyState message="Không có phát sinh nào trong phạm vi đã chọn." />
            ) : (
              <div className="max-h-[60vh] overflow-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Số hiệu</TableHead>
                      <TableHead>Diễn giải</TableHead>
                      <TableHead>Chứng từ</TableHead>
                      <TableHead className="text-right">PS Nợ</TableHead>
                      <TableHead className="text-right">PS Có</TableHead>
                      <TableHead className="text-right">Dư Nợ</TableHead>
                      <TableHead className="text-right">Dư Có</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.lines.map((line, index) => (
                      <TableRow key={`${line.journalEntryId}-${index}`}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDate(line.date)}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {line.entryNo ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-[280px] text-sm">
                          <span className="block truncate" title={line.description}>
                            {line.description}
                          </span>
                          {line.lineDescription ? (
                            <span className="text-muted-foreground block truncate text-xs">
                              {line.lineDescription}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {line.reference ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(line.debit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(line.credit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(line.balanceDebit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(line.balanceCredit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>Tổng phát sinh</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(ledger.totalDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(ledger.totalCredit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(ledger.closingDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                        {formatMoney(ledger.closingCredit)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function SummaryTile({
  label,
  debit,
  credit,
  emphasized,
}: {
  label: string
  debit: string
  credit: string
  emphasized?: boolean
}) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">Nợ</span>
          <span
            className={`font-mono tabular-nums ${emphasized ? 'font-semibold' : ''}`}
          >
            {formatMoney(debit)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">Có</span>
          <span
            className={`font-mono tabular-nums ${emphasized ? 'font-semibold' : ''}`}
          >
            {formatMoney(credit)}
          </span>
        </div>
      </div>
    </div>
  )
}
