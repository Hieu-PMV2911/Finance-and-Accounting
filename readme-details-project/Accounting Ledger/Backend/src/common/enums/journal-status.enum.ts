/**
 * Vòng đời bút toán (journal entry).
 *
 * ```
 * draft ──(checker xác nhận)──▶ approved ──(poster ghi sổ)──▶ posted ──(đảo)──▶ reversed
 *   ▲                                                            │
 *   └── được sửa/xóa ────────────────────────────────────────────┘ (không thể quay lại)
 * ```
 *
 * Bất biến: bút toán đã `posted` **không được sửa/xóa**. Sai thì tạo bút toán
 * đảo (reversing entry) và giữ nguyên lịch sử.
 */
export enum JournalStatus {
  /** Nháp — `maker` lập, còn sửa/xóa được. */
  DRAFT = 'draft',
  /** Đã được `checker` xác nhận — chờ `poster` ghi sổ. */
  APPROVED = 'approved',
  /** Đã ghi sổ — bất biến. */
  POSTED = 'posted',
  /** Đã bị đảo bởi một bút toán điều chỉnh khác. */
  REVERSED = 'reversed',
}

export const ALL_JOURNAL_STATUSES: readonly JournalStatus[] =
  Object.values(JournalStatus);

/** Nhãn tiếng Việt để hiển thị. */
export const JOURNAL_STATUS_LABELS: Record<JournalStatus, string> = {
  [JournalStatus.DRAFT]: 'Nháp',
  [JournalStatus.APPROVED]: 'Đã xác nhận',
  [JournalStatus.POSTED]: 'Đã ghi sổ',
  [JournalStatus.REVERSED]: 'Đã đảo',
};

/** Trạng thái bị khóa cứng — không cho sửa/xóa. */
export function isImmutable(status: JournalStatus): boolean {
  return status === JournalStatus.POSTED || status === JournalStatus.REVERSED;
}
