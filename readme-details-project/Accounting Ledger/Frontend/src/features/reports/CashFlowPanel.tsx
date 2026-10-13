import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Banknote, Coins, Wallet } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toMinor } from '@/lib/money'
import type { CashFlowGroup, ReportScope } from '@/types/api'
import { ReportBarChart } from './ReportBarChart'
import { ReportStat } from './ReportStat'
import { fetchCashFlow } from './reports.api'

/**
 * Báo cáo lưu chuyển tiền tệ (phương pháp trực tiếp).
 *
 * Bất biến: `tiền cuối kỳ = tiền đầu kỳ + lưu chuyển ròng`, và lưu chuyển ròng
 * bằng tổng 3 nhóm hoạt động (kinh doanh / đầu tư / tài chính).
 */
export function CashFlowPanel({ scope }: { scope: ReportScope }) {
  const query = useQuery({
    queryKey: ['reports', 'cash-flow', scope],
    queryFn: () => fetchCashFlow(scope),
  })
  const report = query.data

  if (query.isLoading) {
    return (
      <Card className="gap-0 py-0">
        <TableLoading rows={5} cols={4} />
      </Card>
    )
  }
  if (query.isError) {
    return (
      <Card className="gap-0 py-0">
        <ErrorState message={apiErrorMessage(query.error)} />
      </Card>
    )
  }
  if (!report) {
    return (
      <Card className="gap-0 py-0">
        <EmptyState message="Không có dữ liệu báo cáo." />
      </Card>
    )
  }

  const net = toMinor(report.netChange)
  const netTone = net > 0n ? 'positive' : net < 0n ? 'negative' : 'default'

  const chartData = report.groups.map((group) => ({
    name: group.label,
    value: Number(group.net),
  }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {report.periodCode ? `Kỳ ${report.periodCode} · ` : ''}
        {formatDate(report.fromDate)} → {formatDate(report.toDate)}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <ReportStat
          label="Tiền đầu kỳ"
          value={formatMoney(report.openingCash)}
          icon={Coins}
        />
        <ReportStat
          label="Lưu chuyển tiền thuần"
          value={formatMoney(report.netChange)}
          icon={Banknote}
          tone={netTone}
        />
        <ReportStat
          label="Tiền cuối kỳ"
          value={formatMoney(report.closingCash)}
          icon={Wallet}
        />
      </div>

      {chartData.some((item) => item.value !== 0) ? (
        <Card className="py-4">
          <ReportBarChart data={chartData} />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {report.groups.map((group) => (
          <CashFlowGroupCard key={group.key} group={group} />
        ))}
      </div>
    </div>
  )
}

function CashFlowGroupCard({ group }: { group: CashFlowGroup }) {
  const net = toMinor(group.net)

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b">
        <CardTitle className="text-base">{group.label}</CardTitle>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-emerald-600">
            <ArrowUpRight className="size-3.5" />
            <span className="font-mono tabular-nums">
              {formatMoney(group.inflow)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-rose-600">
            <ArrowDownLeft className="size-3.5" />
            <span className="font-mono tabular-nums">
              {formatMoney(group.outflow)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Thuần:{' '}
            <span
              className={`font-mono font-semibold tabular-nums ${
                net > 0n ? 'text-emerald-600' : net < 0n ? 'text-rose-600' : ''
              }`}
            >
              {formatMoney(group.net)}
            </span>
          </span>
        </div>
      </CardHeader>

      {group.items.length === 0 ? (
        <EmptyState message="Không có dòng tiền." />
      ) : (
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Mã TK</TableHead>
                <TableHead>Chỉ tiêu</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => (
                <TableRow key={item.accountId}>
                  <TableCell className="font-mono text-sm font-semibold">
                    {item.accountCode}
                  </TableCell>
                  <TableCell className="text-sm">{item.accountName}</TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm tabular-nums ${
                      toMinor(item.amount) < 0n ? 'text-rose-600' : ''
                    }`}
                  >
                    {formatMoney(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}
