import type { ComponentType, ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'positive' | 'negative'

const TONE_TEXT: Record<Tone, string> = {
  default: '',
  positive: 'text-emerald-600',
  negative: 'text-rose-600',
}

const TONE_ICON: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  positive: 'bg-emerald-50 text-emerald-600',
  negative: 'bg-rose-50 text-rose-600',
}

interface ReportStatProps {
  label: string
  /** Chuỗi đã định dạng sẵn (dùng `formatMoney` / phần trăm). */
  value: string
  icon?: ComponentType<{ className?: string }>
  tone?: Tone
  hint?: ReactNode
}

/** Ô số liệu tóm tắt của báo cáo. */
export function ReportStat({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
}: ReportStatProps) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p
            className={cn(
              'mt-2 truncate font-mono text-2xl font-semibold tracking-tight tabular-nums',
              TONE_TEXT[tone],
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              TONE_ICON[tone],
            )}
          >
            <Icon className="size-4" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
