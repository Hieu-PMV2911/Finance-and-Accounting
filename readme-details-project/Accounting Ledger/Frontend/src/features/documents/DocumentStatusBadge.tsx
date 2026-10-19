import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@/types/api'

/** Màu theo trạng thái — cùng bảng màu với badge trạng thái đối tượng. */
const STATUS_STYLES: Record<DocumentStatus, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  approved: 'border-sky-200 bg-sky-50 text-sky-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  voided: 'border-rose-200 bg-rose-50 text-rose-700',
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status])}>
      {DOCUMENT_STATUS_LABELS[status]}
    </Badge>
  )
}
