/**
 * Đối tượng **nội bộ** mà một dòng sao kê có thể khớp tới (mục 10.B).
 *
 * Chỉ hai loại, vì đối soát ngân hàng chỉ có nghĩa với hai thứ:
 * - `payment` — phiếu thu/chi đã ghi sổ (khoản tiền nội bộ đã hạch toán).
 * - `journal_entry` — bút toán nhập tay có dòng trên tài khoản tiền (phí/lãi ngân hàng…).
 */
export enum ReconciliationTargetType {
  PAYMENT = 'payment',
  JOURNAL_ENTRY = 'journal_entry',
}

export const ALL_RECONCILIATION_TARGET_TYPES: readonly ReconciliationTargetType[] =
  Object.values(ReconciliationTargetType);

export const RECONCILIATION_TARGET_TYPE_LABELS: Record<
  ReconciliationTargetType,
  string
> = {
  [ReconciliationTargetType.PAYMENT]: 'Phiếu thu/chi',
  [ReconciliationTargetType.JOURNAL_ENTRY]: 'Bút toán',
};

/** Cách sinh ra một dòng khớp: do máy gợi ý hay do người xác nhận. */
export enum ReconciliationMatchedBy {
  /** Khớp tự động theo thuật toán 3 tầng. */
  AUTO = 'auto',
  /** Người dùng xác nhận/gán tay. */
  MANUAL = 'manual',
}

export const ALL_RECONCILIATION_MATCHED_BY: readonly ReconciliationMatchedBy[] =
  Object.values(ReconciliationMatchedBy);

export const RECONCILIATION_MATCHED_BY_LABELS: Record<
  ReconciliationMatchedBy,
  string
> = {
  [ReconciliationMatchedBy.AUTO]: 'Tự động',
  [ReconciliationMatchedBy.MANUAL]: 'Thủ công',
};

/**
 * Tầng khớp đã tìm ra kết quả (mục 10.B — "khớp 3 tầng").
 *
 * Lưu lại **tầng nào** khớp để người đối soát biết mức độ tin cậy: tầng 1 là bằng
 * chứng, tầng 3 chỉ là gợi ý.
 */
export enum ReconciliationMatchTier {
  /** (1) `bankRef`/`reference` trùng **và** số tiền trùng ⇒ khớp chắc chắn. */
  EXACT_REFERENCE = 'exact_reference',
  /** (2) Số tiền trùng và ngày lệch trong khoảng ±N ngày ⇒ gợi ý mạnh. */
  AMOUNT_AND_DATE = 'amount_and_date',
  /** (3) Diễn giải chứa mã chứng từ ⇒ gợi ý yếu. */
  FUZZY_DESCRIPTION = 'fuzzy_description',
}

export const ALL_RECONCILIATION_MATCH_TIERS: readonly ReconciliationMatchTier[] =
  Object.values(ReconciliationMatchTier);

export const RECONCILIATION_MATCH_TIER_LABELS: Record<
  ReconciliationMatchTier,
  string
> = {
  [ReconciliationMatchTier.EXACT_REFERENCE]: 'Khớp chính xác (số tham chiếu)',
  [ReconciliationMatchTier.AMOUNT_AND_DATE]: 'Khớp số tiền + ngày',
  [ReconciliationMatchTier.FUZZY_DESCRIPTION]: 'Gợi ý theo diễn giải',
};
