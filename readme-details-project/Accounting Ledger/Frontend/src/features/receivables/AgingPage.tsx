import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'

import { EmptyState, ErrorState, TableLoading } from '@/components/DataStates'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { apiErrorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import {
  ALLOCATION_TARGET_LABELS,
  type AgingBucket,
  type AgingLine,
  type AgingPartyRow,
} from '@/types/api'
import { listParties } from '../parties/parties.api'
import { fetchAging, type AgingKind } from './receivables.api'

const ALL = '__all__'

/** Mảng ổn định khi chưa tải xong — tránh `useMemo` phụ thuộc giá trị mới mỗi render. */
const NO_BUCKETS: AgingBucket[] = []

/**
 * Công nợ — tuổi nợ phải thu / phải trả (mục 10.A).
 *
 * Hai câu hỏi khác nhau, hai bảng khác nhau:
 * - **Theo đối tượng**: ai đang nợ mình / mình đang nợ ai, chia nhóm tuổi.
 * - **Theo chứng từ**: nợ đó đến từ hóa đơn nào — để mở tiếp tới bút toán.
 *
 * Bất biến backend đã kiểm bằng test: **Σ nhóm = Σ còn lại = tổng cộng**; màn
 * hình chỉ hiển thị lại đúng các con số đó, không tự cộng khác đi.
 */
export function AgingPage() {
  const [kind, setKind] = useState<AgingKind>('receivables')
  const [view, setView] = useState<'parties' | 'lines'>('parties')
  const [asOfDate, setAsOfDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [partyFilter, setPartyFilter] = useState('')
  const [includeSettled, setIncludeSettled] = useState(false)

  const partiesQuery = useQuery({
    queryKey: ['parties', { isActive: true }],
    queryFn: () => listParties({ isActive: true }),
  })

  const agingQuery = useQuery({
    queryKey: [
      'aging',
      kind,
      { asOfDate, partyId: partyFilter, includeSettled },
    ],
    queryFn: () =>
      fetchAging(kind, {
        asOfDate,
        partyId: partyFilter || undefined,
        includeSettled,
      }),
  })

  const data = agingQuery.data
  const buckets = data?.buckets ?? NO_BUCKETS

  const bucketLabels = useMemo(
    () => new Map(buckets.map((bucket) => [bucket.key, bucket.label])),
    [buckets],
  )

  const partyColumns = useMemo<ColumnDef<AgingPartyRow>[]>(
    () => [
      {
        id: 'party',
        header: 'Đối tượng',
        cell: ({ row }) => (
          <div className="grid">
            <span className="font-medium">{row.original.partyName}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {row.original.partyCode}
            </span>
          </div>
        ),
      },
      ...buckets.map<ColumnDef<AgingPartyRow>>((bucket) => ({
        id: `bucket-${bucket.key}`,
        header: bucket.label,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatMoney(row.original.buckets[bucket.key])}
          </div>
        ),
      })),
      {
        id: 'total',
        header: 'Tổng cộng',
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {formatMoney(row.original.total)}
          </div>
        ),
      },
    ],
    [buckets],
  )

  const lineColumns = useMemo<ColumnDef<AgingLine>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Chứng từ" />
        ),
        cell: ({ row }) => (
          <div className="grid">
            <span className="font-mono font-medium">{row.original.code}</span>
            <span className="text-muted-foreground text-xs">
              {ALLOCATION_TARGET_LABELS[row.original.targetType]}
            </span>
          </div>
        ),
      },
      {
        id: 'party',
        header: 'Đối tượng',
        cell: ({ row }) => (
          <div className="grid">
            <span>{row.original.partyName}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {row.original.partyCode}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'date',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Ngày" />
        ),
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        accessorKey: 'dueDate',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Đến hạn" />
        ),
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        accessorKey: 'total',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Tổng tiền" />
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatMoney(row.original.total)}
          </div>
        ),
      },
      {
        accessorKey: 'allocated',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Đã thanh toán" />
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatMoney(row.original.allocated)}
          </div>
        ),
      },
      {
        accessorKey: 'outstanding',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Còn lại" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {formatMoney(row.original.outstanding)}
          </div>
        ),
      },
      {
        id: 'aging',
        header: 'Tuổi nợ',
        enableSorting: false,
        cell: ({ row }) => {
          const { bucket, daysOverdue } = row.original
          const overdue = daysOverdue !== null && daysOverdue > 0
          return (
            <div className="grid gap-1">
              <Badge
                variant="outline"
                className={
                  overdue
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }
              >
                {bucketLabels.get(bucket) ?? bucket}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {daysOverdue === null
                  ? 'Không có hạn'
                  : overdue
                    ? `${daysOverdue} ngày`
                    : 'Chưa đến hạn'}
              </span>
            </div>
          )
        },
      },
    ],
    [bucketLabels],
  )

  const lines = data?.lines ?? []
  const parties = data?.parties ?? []

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Công nợ"
        description="Tuổi nợ phải thu / phải trả tính từ ngày đến hạn. Số còn lại luôn là giá trị dẫn xuất từ phân bổ thanh toán, không lưu cột riêng."
      />

      <Tabs
        value={kind}
        onValueChange={(value) => setKind(value as AgingKind)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <TabsList className="w-fit">
            <TabsTrigger value="receivables">Phải thu (131)</TabsTrigger>
            <TabsTrigger value="payables">Phải trả (331)</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Tính tại ngày</Label>
              <DatePicker
                value={asOfDate}
                onChange={setAsOfDate}
                ariaLabel="Ngày tính tuổi nợ"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Đối tượng</Label>
              <Select
                value={partyFilter || ALL}
                onValueChange={(value) =>
                  setPartyFilter(value === ALL ? '' : value)
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Tất cả đối tượng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả đối tượng</SelectItem>
                  {(partiesQuery.data ?? []).map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.code} — {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="include-settled"
                checked={includeSettled}
                onCheckedChange={(checked) => setIncludeSettled(checked === true)}
              />
              <Label htmlFor="include-settled" className="font-normal">
                Gồm chứng từ đã tất toán
              </Label>
            </div>
          </div>
        </div>

        {agingQuery.isLoading ? (
          <Card>
            <TableLoading rows={5} cols={6} />
          </Card>
        ) : agingQuery.isError ? (
          <Card>
            <ErrorState message={apiErrorMessage(agingQuery.error)} />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-muted-foreground text-xs">Tổng còn lại</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatMoney(data?.totalOutstanding ?? '0')}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Tại {formatDate(data?.asOfDate ?? asOfDate)}
                </p>
              </div>
              {buckets.map((bucket) => (
                <div key={bucket.key} className="rounded-lg border bg-card p-4">
                  <p className="text-muted-foreground text-xs">{bucket.label}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(bucket.amount)}
                  </p>
                </div>
              ))}
            </div>

            <Tabs
              value={view}
              onValueChange={(value) =>
                setView(value as 'parties' | 'lines')
              }
              className="gap-3"
            >
              <TabsList className="w-fit">
                <TabsTrigger value="parties">Theo đối tượng</TabsTrigger>
                <TabsTrigger value="lines">Theo chứng từ</TabsTrigger>
              </TabsList>

              <TabsContent value="parties">
                <Card className="gap-0 overflow-hidden py-0">
                  {parties.length === 0 ? (
                    <EmptyState message="Không có công nợ nào tại ngày đã chọn." />
                  ) : (
                    <DataTable columns={partyColumns} data={parties} />
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="lines">
                <Card className="gap-0 overflow-hidden py-0">
                  {lines.length === 0 ? (
                    <EmptyState message="Không có chứng từ nào còn nợ." />
                  ) : (
                    <DataTable columns={lineColumns} data={lines} />
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </Tabs>
    </div>
  )
}
