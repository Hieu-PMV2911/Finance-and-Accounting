import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiErrorMessage } from '@/lib/api'
import { defaultScope } from '@/lib/scope'
import type { FiscalPeriod, ReportScope } from '@/types/api'
import { listFiscalPeriods } from '../periods/periods.api'
import { GeneralLedgerPanel } from './GeneralLedgerPanel'
import { ReconciliationPanel } from './ReconciliationPanel'
import { TrialBalancePanel } from './TrialBalancePanel'

/**
 * Sổ cái (mục 6): sổ cái chi tiết, bảng cân đối số phát sinh và đối chiếu số dư.
 *
 * Mọi số liệu đều do backend **tái lập từ `journal_lines` của bút toán đã ghi
 * sổ** (posted/reversed) nên tra được cho mọi khoảng ngày, không phụ thuộc kỳ
 * đã chốt hay chưa.
 */
export function LedgerPage() {
  const periodsQuery = useQuery({
    queryKey: ['fiscal-periods', 'options'],
    queryFn: () => listFiscalPeriods(),
  })
  const periods = periodsQuery.data ?? []

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Sổ cái"
        description="Sổ cái chi tiết theo tài khoản, bảng cân đối số phát sinh và đối chiếu số dư đã lưu với số dư tái lập từ bút toán."
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
        <LedgerTabs periods={periods} />
      )}
    </div>
  )
}

/**
 * Phần thân tách riêng để chỉ mount **sau khi** danh sách kỳ đã có — nhờ vậy
 * phạm vi mặc định (`defaultScope`) tính được ngay trong bộ khởi tạo `useState`
 * mà không cần setState trong `useEffect`.
 */
function LedgerTabs({ periods }: { periods: FiscalPeriod[] }) {
  const [scope, setScope] = useState<ReportScope>(() => defaultScope(periods))

  return (
    <Tabs defaultValue="gl" className="gap-4">
      <TabsList className="w-fit">
        <TabsTrigger value="gl">Sổ cái chi tiết</TabsTrigger>
        <TabsTrigger value="tb">Bảng cân đối số phát sinh</TabsTrigger>
        <TabsTrigger value="rec">Đối chiếu số dư</TabsTrigger>
      </TabsList>

      <TabsContent value="gl">
        <GeneralLedgerPanel
          periods={periods}
          scope={scope}
          onScopeChange={setScope}
        />
      </TabsContent>

      <TabsContent value="tb">
        <TrialBalancePanel
          periods={periods}
          scope={scope}
          onScopeChange={setScope}
        />
      </TabsContent>

      <TabsContent value="rec">
        <ReconciliationPanel periods={periods} />
      </TabsContent>
    </Tabs>
  )
}
