import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, Search } from 'lucide-react'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import type { FiscalPeriod, Party, ReportScope, SubLedgerLine } from '@/types/api'
import { TraceJournalView } from '../audit/TraceJournalView'
import { listParties } from '../parties/parties.api'
import { fetchSubLedger } from './subledger.api'

interface SubLedgerPanelProps {
  periods: FiscalPeriod[]
  scope: ReportScope
  onScopeChange: (scope: ReportScope) => void
}

export function SubLedgerPanel({
  periods,
  scope,
  onScopeChange,
}: SubLedgerPanelProps) {
  const [partyId, setPartyId] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')
  const [traceId, setTraceId] = useState<string | null>(null)

  const partiesQuery = useQuery({
    queryKey: ['parties', { isActive: true }],
    queryFn: () => listParties({ isActive: true }),
  })
  const parties = partiesQuery.data ?? []

  // Tự chọn đối tượng đầu tiên khi chưa chọn: **suy ra ngay lúc render** thay vì
  // setState trong `useEffect` — vừa tránh cảnh báo "set-state-in-effect", vừa
  // không phải chạy lại effect mỗi lần `parties` đổi sau khi refetch.
  const selectedPartyId = partyId || parties[0]?.id || ''

  const subLedgerQuery = useQuery({
    queryKey: ['sub-ledger', scope, selectedPartyId, accountId],
    queryFn: () =>
      fetchSubLedger({
        partyId: selectedPartyId,
        accountId: accountId || undefined,
        periodId: scope.periodId,
        fromDate: scope.fromDate,
        toDate: scope.toDate,
      }),
    enabled: Boolean(selectedPartyId),
  })

  const data = subLedgerQuery.data

  const accountOptions = useMemo(() => data?.accountCodes ?? [], [data])

  const columns = useMemo<ColumnDef<SubLedgerLine>[]>(() => [
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày" />,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      accessorKey: 'entryNo',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Chứng từ" />,
      cell: ({ row }) => (
        <button
          className="text-primary hover:underline"
          onClick={() => setTraceId(row.original.journalEntryId)}
        >
          {row.original.entryNo ?? row.original.journalEntryId.slice(0, 8)}
        </button>
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Diễn giải" />,
      cell: ({ row }) => row.original.description || row.original.lineDescription || '—',
    },
    {
      accessorKey: 'accountCode',
      header: ({ column }) => <DataTableColumnHeader column={column} title="TK" />,
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          <div>{row.original.accountCode}</div>
          <div className="text-muted-foreground">{row.original.accountName}</div>
        </div>
      ),
    },
    {
      accessorKey: 'debit',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nợ" className="text-right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono">{formatMoney(row.original.debit)}</div>
      ),
    },
    {
      accessorKey: 'credit',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Có" className="text-right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono">{formatMoney(row.original.credit)}</div>
      ),
    },
    {
      accessorKey: 'balanceDebit',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dư Nợ" className="text-right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono">{formatMoney(row.original.balanceDebit)}</div>
      ),
    },
    {
      accessorKey: 'balanceCredit',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dư Có" className="text-right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono">{formatMoney(row.original.balanceCredit)}</div>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">#</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setTraceId(row.original.journalEntryId)}
          >
            <Eye className="size-4" />
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Select value={selectedPartyId} onValueChange={setPartyId}>
              <SelectTrigger className="pl-9">
                <SelectValue placeholder="Chọn đối tượng" />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p: Party) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select
            value={accountId || '__all__'}
            onValueChange={(v) => setAccountId(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tất cả TK công nợ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tất cả TK công nợ</SelectItem>
              {accountOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={scope.periodId || '__custom__'}
            onValueChange={(value) => {
              if (value === '__custom__') {
                // keep custom range
                return
              }
              const period = periods.find((p) => p.id === value)
              if (period) {
                onScopeChange({
                  periodId: period.id,
                  fromDate: period.startDate,
                  toDate: period.endDate,
                })
              }
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Chọn kỳ kế toán" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={scope.fromDate ?? ''}
            onChange={(e) =>
              onScopeChange({ ...scope, periodId: undefined, fromDate: e.target.value })
            }
            className="w-[140px]"
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            value={scope.toDate ?? ''}
            onChange={(e) =>
              onScopeChange({ ...scope, periodId: undefined, toDate: e.target.value })
            }
            className="w-[140px]"
          />
        </div>

        <div>
          {partiesQuery.isLoading ? (
            <TableLoading />
          ) : !selectedPartyId ? (
            <EmptyState message="Vui lòng chọn đối tượng để xem sổ cái phụ." />
          ) : subLedgerQuery.isLoading ? (
            <TableLoading />
          ) : subLedgerQuery.isError ? (
            <ErrorState message={apiErrorMessage(subLedgerQuery.error)} />
          ) : !data || data.lines.length === 0 ? (
            <EmptyState message="Không có phát sinh trong khoảng đã chọn." />
          ) : (
            <DataTable columns={columns} data={data.lines} />
          )}
        </div>

        {data && data.lines.length > 0 && (
          <div className="grid grid-cols-2 gap-4 border-t p-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Dư đầu kỳ (Nợ)</div>
              <div className="font-mono">{formatMoney(data.openingDebit)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Dư đầu kỳ (Có)</div>
              <div className="font-mono">{formatMoney(data.openingCredit)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Dư cuối kỳ (Nợ)</div>
              <div className="font-mono">{formatMoney(data.closingDebit)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Dư cuối kỳ (Có)</div>
              <div className="font-mono">{formatMoney(data.closingCredit)}</div>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={Boolean(traceId)} onOpenChange={(open) => !open && setTraceId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Truy vết bút toán</DialogTitle>
          </DialogHeader>
          {traceId && <TraceJournalView entryId={traceId} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
