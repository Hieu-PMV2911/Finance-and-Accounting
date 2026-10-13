import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatMoney } from '@/lib/format'

/** Bảng màu lấy từ token `--chart-*` nên tự đổi theo sáng/tối. */
const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export interface ChartDatum {
  name: string
  value: number
}

const compact = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

interface ReportBarChartProps {
  data: ChartDatum[]
  height?: number
}

/**
 * Biểu đồ cột ngang tóm tắt các chỉ tiêu chính của báo cáo.
 *
 * Giá trị ở đây **chỉ để trực quan hóa** nên chấp nhận chuyển sang `number`;
 * mọi con số hiển thị cho người dùng vẫn là chuỗi tiền gốc qua `formatMoney`.
 */
export function ReportBarChart({ data, height = 220 }: ReportBarChartProps) {
  // Không vẽ khi chưa có dữ liệu hoặc mọi chỉ tiêu đều bằng 0 — tránh khung
  // biểu đồ trống trông như lỗi.
  if (data.length === 0 || data.every((item) => item.value === 0)) return null

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 28, bottom: 4, left: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickFormatter={(value: number) => compact.format(value)}
            stroke="var(--muted-foreground)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            stroke="var(--muted-foreground)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            formatter={(value) => formatMoney(String(value))}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--popover-foreground)' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((item, index) => (
              <Cell
                key={item.name}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
