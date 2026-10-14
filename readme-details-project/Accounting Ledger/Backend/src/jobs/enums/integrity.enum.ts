/**
 * Mức độ vi phạm bất biến.
 *
 * `CRITICAL` = dữ liệu kế toán đã sai (Σ Nợ ≠ Σ Có, số dư lệch) — phải xử lý.
 * `WARNING` = dữ liệu đáng ngờ nhưng chưa chắc sai.
 * `INFO` = ghi nhận để theo dõi.
 */
export enum IntegritySeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export const ALL_INTEGRITY_SEVERITIES: readonly IntegritySeverity[] =
  Object.values(IntegritySeverity);

export const INTEGRITY_SEVERITY_LABELS: Record<IntegritySeverity, string> = {
  [IntegritySeverity.INFO]: 'Thông tin',
  [IntegritySeverity.WARNING]: 'Cảnh báo',
  [IntegritySeverity.CRITICAL]: 'Nghiêm trọng',
};

/**
 * Bộ kiểm tra bất biến (mục 9 — "kiểm tra bất biến").
 *
 * Mỗi mã tương ứng một bất biến trong `DEVELOPMENT_PLAN.md` mục 5.3 và
 * `AGENTS.md` mục 5. Đây là lưới an toàn chạy định kỳ: nếu có gì đó lọt qua
 * tầng service (bug, sửa tay trong DB, dữ liệu di trú), job sẽ phát hiện.
 */
export enum IntegrityCheckCode {
  /** Bất biến 1: mỗi bút toán đã ghi sổ phải có Σ Nợ = Σ Có. */
  UNBALANCED_JOURNAL = 'unbalanced-journal',
  /** Bất biến 5: `account_balances` phải tái lập được từ `journal_lines`. */
  BALANCE_DRIFT = 'balance-drift',
  /** Bất biến 3: kỳ đã khóa/chốt không được có bút toán đã ghi sổ. */
  POSTED_IN_FROZEN_PERIOD = 'posted-in-frozen-period',
  /** Dòng định khoản không gắn bút toán hoặc không gắn tài khoản (mồ côi). */
  ORPHAN_JOURNAL_LINE = 'orphan-journal-line',
  /** Bất biến 2: mỗi dòng chỉ có Nợ XOR Có, và số tiền không âm. */
  INVALID_LINE_AMOUNT = 'invalid-line-amount',
  /** Bất biến 4: chỉ được ghi vào tài khoản lá (`is_postable = true`). */
  NON_POSTABLE_ACCOUNT_USAGE = 'non-postable-account-usage',
  /** Số hiệu bút toán (`entry_no`) không được trùng trong cùng một kỳ. */
  DUPLICATE_ENTRY_NO = 'duplicate-entry-no',
}

export const ALL_INTEGRITY_CHECK_CODES: readonly IntegrityCheckCode[] =
  Object.values(IntegrityCheckCode);

export const INTEGRITY_CHECK_LABELS: Record<IntegrityCheckCode, string> = {
  [IntegrityCheckCode.UNBALANCED_JOURNAL]: 'Bút toán không cân bằng Nợ/Có',
  [IntegrityCheckCode.BALANCE_DRIFT]: 'Số dư lệch so với bút toán',
  [IntegrityCheckCode.POSTED_IN_FROZEN_PERIOD]: 'Ghi sổ vào kỳ đã khóa/chốt',
  [IntegrityCheckCode.ORPHAN_JOURNAL_LINE]: 'Dòng định khoản mồ côi',
  [IntegrityCheckCode.INVALID_LINE_AMOUNT]: 'Dòng định khoản sai số tiền',
  [IntegrityCheckCode.NON_POSTABLE_ACCOUNT_USAGE]:
    'Ghi sổ vào tài khoản cha (không phải tài khoản lá)',
  [IntegrityCheckCode.DUPLICATE_ENTRY_NO]: 'Số hiệu bút toán bị trùng',
};

/** Mức độ mặc định của từng loại vi phạm. */
export const INTEGRITY_CHECK_SEVERITY: Record<IntegrityCheckCode, IntegritySeverity> = {
  [IntegrityCheckCode.UNBALANCED_JOURNAL]: IntegritySeverity.CRITICAL,
  [IntegrityCheckCode.BALANCE_DRIFT]: IntegritySeverity.CRITICAL,
  [IntegrityCheckCode.POSTED_IN_FROZEN_PERIOD]: IntegritySeverity.CRITICAL,
  [IntegrityCheckCode.ORPHAN_JOURNAL_LINE]: IntegritySeverity.CRITICAL,
  [IntegrityCheckCode.INVALID_LINE_AMOUNT]: IntegritySeverity.CRITICAL,
  [IntegrityCheckCode.NON_POSTABLE_ACCOUNT_USAGE]: IntegritySeverity.WARNING,
  [IntegrityCheckCode.DUPLICATE_ENTRY_NO]: IntegritySeverity.CRITICAL,
};
