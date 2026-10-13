import { useQuery } from '@tanstack/react-query'
import { Percent, TrendingDown, TrendingUp, Wallet } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Card } from '@/components/ui/card'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney, formatPercent } from '@/lib/format'
import { toMinor } from '@/lib/money'
import type { ReportScope } from '@/types/api'
import { ReportBarChart } from './ReportBarChart'
import { ReportSectionTable } from './ReportSectionTable'
import { ReportStat } from './ReportStat'
import { fetchProfitAndLoss } from './reports.api'

/** Báo cáo kết quả kinh doanh: doanh thu − chi phí = lợi nhuận thuần. */
export function ProfitAndLossPanel({ scope }: { scope: ReportScope }) {
  const query = useQuery({
    queryKey: ['reports', 'profit-and-loss', scope],
    queryFn: () => fetchProfitAndLoss(scope),
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

  const net = toMinor(report.netProfit)
  const netTone = net > 0n ? 'positive' : net < 0n ? 'negative' : 'default'

  const chartData = [
    { name: 'Doanh thu', value: Number(report.revenue.total) },
    { name: 'Chi phí', value: Number(report.expense.total) },
    { name: 'Lợi nhuận thuần', value: Number(report.netProfit) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {report.periodCode ? `Kỳ ${report.periodCode} · ` : ''}
        {formatDate(report.fromDate)} → {formatDate(report.toDate)}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat
          label="Tổng doanh thu"
          value={formatMoney(report.revenue.total)}
          icon={TrendingUp}
        />
        <ReportStat
          label="Tổng chi phí"
          value={formatMoney(report.expense.total)}
          icon={TrendingDown}
        />
        <ReportStat
          label="Lợi nhuận thuần"
          value={formatMoney(report.netProfit)}
          icon={Wallet}
          tone={netTone}
          hint="Doanh thu − Chi phí"
        />
        <ReportStat
          label="Biên lợi nhuận"
          value={formatPercent(report.netProfitMargin)}
          icon={Percent}
          hint={
            report.netProfitMargin === null
              ? 'Kỳ không phát sinh doanh thu'
              : 'Lợi nhuận / Doanh thu'
          }
        />
      </div>

      {chartData.some((item) => item.value !== 0) ? (
        <Card className="py-4">
          <ReportBarChart data={chartData} />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSectionTable
          title="Doanh thu"
          description="Số dư Có trừ Nợ của tài khoản doanh thu"
          section={report.revenue}
        />
        <ReportSectionTable
          title="Chi phí"
          description="Số dư Nợ trừ Có của tài khoản chi phí"
          section={report.expense}
        />
      </div>
    </div>
  )
}
