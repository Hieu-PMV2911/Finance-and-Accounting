import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TraceJournalView } from './TraceJournalView'

interface TraceJournalDialogProps {
  /** Id bút toán cần truy vết; `null` để đóng. */
  entryId: string | null
  /** Nhãn hiển thị (số hiệu bút toán) cho phần mô tả. */
  entryLabel?: string | null
  onOpenChange: (open: boolean) => void
}

/** Hộp thoại truy vết bút toán — dùng từ danh sách bút toán. */
export function TraceJournalDialog({
  entryId,
  entryLabel,
  onOpenChange,
}: TraceJournalDialogProps) {
  return (
    <Dialog open={Boolean(entryId)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Truy vết bút toán</DialogTitle>
          <DialogDescription>
            {entryLabel ? `${entryLabel} — ` : ''}từ báo cáo → bút toán → chứng từ
            nguồn.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto pr-1">
          {entryId ? <TraceJournalView entryId={entryId} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
