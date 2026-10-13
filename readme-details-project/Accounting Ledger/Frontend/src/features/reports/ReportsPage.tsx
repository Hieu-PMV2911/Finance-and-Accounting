import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { ScopePicker } from '@/components/ScopePicker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiErrorMessage } from '@/lib/api'
import { defaultScope, isScopeReady } from '@/lib/scope'
import {
  REPORT_KIND_LABELS,
  REPORT_KINDS,
  type FiscalPeriod,
  type ReportFormat,
  type ReportKind,
  type ReportScope,
} from '@/types/api'
import { listFiscalPeriods } from '../periods/periods.api'
import { BalanceSheetPanel } from './BalanceSheetPanel'
import { CashFlowPanel } from './CashFlowPanel'
import { ProfitAndLossPanel } from './ProfitAndLossPanel'
import { downloadReport } from './reports.api'

/**
 * Báo cáo tài chính (mục 7): kết quả kinh doanh, bảng cân đối kế toán và lưu
 * chuyển tiền tệ — kèm xuất Excel/PDF.
 *
 * Tab đang chọn chính là `kind` gửi lên endpoint xuất file, nên chỉ cần một cặp
 * nút tải cho cả ba báo cáo.
 */
export function ReportsPage() {
  const periodsQuery = useQuery({
    queryKey: ['fiscal-periods', 'options'],
    queryFn: () => listFiscalPeriods(),
  })
  const periods = periodsQuery.data ?? []

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Báo cáo tài chính"
        description="Kết quả kinh doanh, bảng cân đối kế toán và lưu chuyển tiền tệ. Số liệu được lập trực tiếp từ bút toán đã ghi sổ."
      />

      {periodsQuery.isLoading ? (
        <Card>
          <TableLoading rows={4} cols={4} />
        </Card>
      ) : periodsQuery.isError ? (
        <Card>
          <ErrorState message={apiErrorMessage(periodsQuery.error)} />
        </Card>
      ) : (
        <ReportsContent periods={periods} />
      )}
    </div>
  )
}

/** Tách riêng để khởi tạo phạm vi mặc định sau khi đã có danh sách kỳ. */
function ReportsContent({ periods }: { periods: FiscalPeriod[] }) {
  const [scope, setScope] = useState<ReportScope>(() => defaultScope(periods))
  const [kind, setKind] = useState<ReportKind>('profit-and-loss')
  const ready = isScopeReady(scope)

  const exportMutation = useMutation({
    mutationFn: (format: ReportFormat) => downloadReport(kind, format, scope),
    onSuccess: (filename) => toast.success(`Đã tải xuống ${filename}`),
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'Xuất báo cáo thất bại')),
  })

  const pendingFormat = exportMutation.isPending
    ? exportMutation.variables
    : undefined
  const exporting = exportMutation.isPending

  return (
    <Tabs
      value={kind}
      onValueChange={(value) => setKind(value as ReportKind)}
      className="gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="w-fit">
          {REPORT_KINDS.map((item) => (
            <TabsTrigger key={item} value={item}>
              {REPORT_KIND_LABELS[item]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || exporting}
            onClick={() => exportMutation.mutate('xlsx')}
          >
            {pendingFormat === 'xlsx' ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FileSpreadsheet />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || exporting}
            onClick={() => exportMutation.mutate('pdf')}
          >
            {pendingFormat === 'pdf' ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FileText />
            )}
            PDF
          </Button>
        </div>
      </div>

      <ScopePicker periods={periods} value={scope} onChange={setScope} />

      {!ready ? (
        <Card className="gap-0 py-0">
          <EmptyState message="Chọn đủ phạm vi (kỳ hoặc khoảng ngày) để xem báo cáo." />
        </Card>
      ) : (
        <>
          <TabsContent value="profit-and-loss">
            <ProfitAndLossPanel scope={scope} />
          </TabsContent>
          <TabsContent value="balance-sheet">
            <BalanceSheetPanel scope={scope} />
          </TabsContent>
          <TabsContent value="cash-flow">
            <CashFlowPanel scope={scope} />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}
