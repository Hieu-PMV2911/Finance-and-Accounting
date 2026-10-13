import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Landmark, Scale, TriangleAlert, Wallet } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import type { ReportScope } from '@/types/api'
import { ReportBarChart } from './ReportBarChart'
import { ReportSectionTable } from './ReportSectionTable'
import { ReportStat } from './ReportStat'
import { fetchBalanceSheet } from './reports.api'

/**
 * Bảng cân đối kế toán tại một thời điểm.
 *
 * `toDate` là **ngày lập báo cáo** (số dư lũy kế đến hết ngày đó). Bất biến:
 * `Tài sản = Nợ phải trả + Vốn chủ sở hữu (gồm lợi nhuận giữ lại)`.
 */
export function BalanceSheetPanel({ scope }: { scope: ReportScope }) {
  const query = useQuery({
    queryKey: ['reports', 'balance-sheet', scope],
    queryFn: () => fetchBalanceSheet(scope),
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

  const chartData = [
    { name: 'Tài sản', value: Number(report.totalAssets) },
    { name: 'Nợ phải trả', value: Number(report.liabilities.total) },
    { name: 'Vốn chủ sở hữu', value: Number(report.equity.total) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          {report.periodCode ? `Kỳ ${report.periodCode} · ` : ''}
          Lập ngày {formatDate(report.asOfDate)}
        </p>
        <Badge
          variant="outline"
          className={
            report.balanced
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }
        >
          {report.balanced ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <TriangleAlert className="size-3.5" />
          )}
          {report.balanced ? 'Cân đối' : 'Lệch — kiểm tra lại bút toán'}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat
          label="Tổng tài sản"
          value={formatMoney(report.totalAssets)}
          icon={Landmark}
        />
        <ReportStat
          label="Nợ phải trả"
          value={formatMoney(report.liabilities.total)}
          icon={Scale}
        />
        <ReportStat
          label="Vốn chủ sở hữu"
          value={formatMoney(report.equity.total)}
          icon={Wallet}
        />
        <ReportStat
          label="Lợi nhuận giữ lại"
          value={formatMoney(report.retainedEarnings)}
          hint="Doanh thu − Chi phí lũy kế"
        />
      </div>

      {chartData.some((item) => item.value !== 0) ? (
        <Card className="py-4">
          <ReportBarChart data={chartData} />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportSectionTable
          title="Tài sản"
          description="Số dư Nợ trừ Có của tài khoản tài sản"
          section={report.assets}
        />
        <ReportSectionTable
          title="Nợ phải trả"
          description="Số dư Có trừ Nợ của tài khoản nợ phải trả"
          section={report.liabilities}
        />
        <ReportSectionTable
          title="Vốn chủ sở hữu"
          description="Số dư Có trừ Nợ của tài khoản vốn"
          section={report.equity}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-medium">Cân đối</span>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <span className="text-muted-foreground">
              Tài sản:{' '}
              <span className="text-foreground font-mono font-semibold tabular-nums">
                {formatMoney(report.totalAssets)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Nợ + Vốn:{' '}
              <span className="text-foreground font-mono font-semibold tabular-nums">
                {formatMoney(report.totalLiabilitiesAndEquity)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Lợi nhuận giữ lại:{' '}
              <span className="text-foreground font-mono tabular-nums">
                {formatMoney(report.retainedEarnings)}
              </span>
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
