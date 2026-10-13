import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** Số dòng mặc định trên mỗi trang — yêu cầu nghiệp vụ: 10. */
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Số dòng mỗi trang (mặc định 10). */
  pageSize?: number
  /** Hiện ô chọn số dòng/trang ở chân bảng. */
  showPageSizeSelect?: boolean
  /** Nhấn vào một dòng. */
  onRowClick?: (row: TData) => void
  /** Class thêm cho từng dòng (ví dụ tô đỏ ô lệch). */
  getRowClassName?: (row: Row<TData>) => string | undefined
  /** Ẩn chân bảng khi chỉ có một trang. */
  hidePaginationWhenSinglePage?: boolean
  className?: string
}

/**
 * Bảng dữ liệu dùng chung theo chuẩn shadcn/ui (TanStack Table):
 * sắp xếp theo cột, phân trang phía client, chuyển trang bằng dãy nút số trang.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = DEFAULT_PAGE_SIZE,
  showPageSizeSelect = true,
  onRowClick,
  getRowClassName,
  hidePaginationWhenSinglePage = false,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  // oxlint-disable-next-line react/incompatible-library -- TanStack Table dùng API nội bộ, React Compiler tự bỏ qua
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Đổi dữ liệu (lọc/tìm kiếm) → tự quay về trang 1.
    autoResetPageIndex: true,
    initialState: { pagination: { pageSize, pageIndex: 0 } },
  })

  const rows = table.getRowModel().rows
  const totalRows = data.length

  return (
    <div className={cn('flex flex-col', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center"
              >
                Không có dữ liệu.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={cn(
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row),
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {!(hidePaginationWhenSinglePage && table.getPageCount() <= 1) && (
        <DataTablePagination
          table={table}
          totalRows={totalRows}
          showPageSizeSelect={showPageSizeSelect}
        />
      )}
    </div>
  )
}

interface DataTablePaginationProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>
  totalRows: number
  showPageSizeSelect?: boolean
}

/** Chân bảng: thống kê dòng + dãy nút số trang + điều hướng. */
function DataTablePagination<TData>({
  table,
  totalRows,
  showPageSizeSelect = true,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = table.getPageCount()

  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, totalRows)
  const items = pageItems(pageIndex, pageCount)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3">
      <p className="text-muted-foreground text-sm">
        Hiển thị <span className="text-foreground font-medium">{from}</span>–
        <span className="text-foreground font-medium">{to}</span> trên{' '}
        <span className="text-foreground font-medium">{totalRows}</span> dòng
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {showPageSizeSelect ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Số dòng/trang</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[76px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Trang đầu"
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Trang trước"
          >
            <ChevronLeft />
          </Button>

          {items.map((item, index) =>
            typeof item === 'number' ? (
              <Button
                key={`page-${item}`}
                variant={item === pageIndex ? 'default' : 'outline'}
                size="icon"
                className="size-8 tabular-nums"
                onClick={() => table.setPageIndex(item)}
                aria-label={`Trang ${item + 1}`}
                aria-current={item === pageIndex ? 'page' : undefined}
              >
                {item + 1}
              </Button>
            ) : (
              <span
                key={`gap-${index}`}
                className="text-muted-foreground px-1 text-sm"
              >
                …
              </span>
            ),
          )}

          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Trang sau"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Trang cuối"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Danh sách số trang hiển thị: luôn có trang đầu/cuối, tối đa 2 trang lân cận,
 * phần bị lược bỏ biểu diễn bằng dấu "…".
 */
function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index)
  }

  const items: (number | 'gap')[] = [0]
  const start = Math.max(1, current - 1)
  const end = Math.min(total - 2, current + 1)

  if (start > 1) items.push('gap')
  for (let index = start; index <= end; index += 1) items.push(index)
  if (end < total - 2) items.push('gap')
  items.push(total - 1)

  return items
}

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.ComponentProps<'div'> {
  column: Column<TData, TValue>
  title: string
}

/** Tiêu đề cột bấm được để sắp xếp (giữ nguyên chuẩn shadcn/ui). */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={className}>{title}</div>
  }

  const sorted = column.getIsSorted()

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'text-muted-foreground hover:text-foreground -ml-2 h-8 data-[state=open]:bg-accent',
        className,
      )}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      <span>{title}</span>
      {sorted === 'desc' ? (
        <ArrowDown />
      ) : sorted === 'asc' ? (
        <ArrowUp />
      ) : (
        <ChevronsUpDown className="opacity-50" />
      )}
    </Button>
  )
}
