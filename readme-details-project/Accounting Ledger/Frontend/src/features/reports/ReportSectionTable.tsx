import { EmptyState } from '@/components/DataStates'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney } from '@/lib/format'
import type { ReportSection } from '@/types/api'

interface ReportSectionTableProps {
  title: string
  description?: string
  section: ReportSection
  /** Nhãn cột số tiền (mặc định "Số tiền"). */
  amountLabel?: string
}

/** Một nhóm chỉ tiêu của báo cáo: danh sách dòng tài khoản + tổng nhóm. */
export function ReportSectionTable({
  title,
  description,
  section,
  amountLabel = 'Số tiền',
}: ReportSectionTableProps) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      {section.lines.length === 0 ? (
        <EmptyState message="Không có phát sinh." />
      ) : (
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Mã TK</TableHead>
                <TableHead>Chỉ tiêu</TableHead>
                <TableHead className="text-right">{amountLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.lines.map((line) => (
                <TableRow key={line.accountId}>
                  <TableCell className="font-mono text-sm font-semibold">
                    {line.accountCode}
                  </TableCell>
                  <TableCell className="text-sm">{line.accountName}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatMoney(line.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Tổng {title.toLowerCase()}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(section.total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}
