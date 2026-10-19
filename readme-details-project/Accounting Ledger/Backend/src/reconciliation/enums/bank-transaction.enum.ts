/**
 * Hướng dòng tiền của một dòng sao kê (mục 10.B — P2.2).
 *
 * Dùng `in`/`out` thay vì dấu +/- của số tiền: số tiền luôn dương trong DB,
 * chiều nằm ở cột riêng — như vậy mọi phép so sánh số tiền là so sánh tuyệt
 * đối, không còn chỗ cho "dòng này âm chăng?".
 */
export enum BankTransactionDirection {
  /** Tiền vào tài khoản (khách trả). */
  IN = 'in',
  /** Tiền ra tài khoản (trả nhà cung cấp, phí ngân hàng…). */
  OUT = 'out',
}

export const ALL_BANK_TRANSACTION_DIRECTIONS: readonly BankTransactionDirection[] =
  Object.values(BankTransactionDirection);

export const BANK_TRANSACTION_DIRECTION_LABELS: Record<
  BankTransactionDirection,
  string
> = {
  [BankTransactionDirection.IN]: 'Tiền vào',
  [BankTransactionDirection.OUT]: 'Tiền ra',
};

/** Nguồn dữ liệu dòng sao kê. */
export enum BankTransactionSource {
  /** Tải lên file (CSV/JSON) — adapter `CsvJsonStatementAdapter`. */
  FILE = 'file',
  /** Kết nối API ngân hàng — adapter `BankApiStatementAdapter` (chưa dùng thật). */
  API = 'api',
}

export const ALL_BANK_TRANSACTION_SOURCES: readonly BankTransactionSource[] =
  Object.values(BankTransactionSource);

export const BANK_TRANSACTION_SOURCE_LABELS: Record<
  BankTransactionSource,
  string
> = {
  [BankTransactionSource.FILE]: 'Tải file',
  [BankTransactionSource.API]: 'Kết nối API',
};

/**
 * Trạng thái khớp của một dòng sao kê — **đầu ra của pipeline 3 tầng** (P2.3).
 *
 * - `matched`   : đã khớp xác nhận (tự động tầng 1/2 hoặc người xác nhận).
 * - `suggested` : hệ thống **gợi ý** theo diễn giải (tầng 3) — phải có người
 *   xác nhận trước khi coi là khớp.
 * - `unmatched` : chưa có đối ứng — chờ dòng mới hoặc tạo bút toán phí/lãi.
 */
export enum ReconciliationMatchStatus {
  MATCHED = 'matched',
  SUGGESTED = 'suggested',
  UNMATCHED = 'unmatched',
}

export const ALL_RECONCILIATION_MATCH_STATUSES: readonly ReconciliationMatchStatus[] =
  Object.values(ReconciliationMatchStatus);

export const RECONCILIATION_MATCH_STATUS_LABELS: Record<
  ReconciliationMatchStatus,
  string
> = {
  [ReconciliationMatchStatus.MATCHED]: 'Đã khớp',
  [ReconciliationMatchStatus.SUGGESTED]: 'Gợi ý khớp',
  [ReconciliationMatchStatus.UNMATCHED]: 'Chưa khớp',
};

/** Cấp khớp được xác nhận trong `reconciliation_matches`. */
export enum ReconciliationMatchTier {
  /** Tầng 1: `bankRef`/`reference` khớp mã chứng từ + đúng số tiền. */
  REFERENCE = 1,
  /** Tầng 2: đúng số tiền + ngày gần nhau ±N. */
  AMOUNT_DATE = 2,
  /** Tầng 3: gợi ý mờ — diễn giải chứa mã chứng từ (chờ người xác nhận). */
  FUZZY = 3,
  /** Người khớp thủ công (xác nhận gợi ý hoặc ghép tay). */
  MANUAL = 4,
}

// Enum số ⇒ `Object.values` trả cả khóa lẫn giá trị; liệt kê tường minh.
export const ALL_RECONCILIATION_MATCH_TIERS: readonly ReconciliationMatchTier[] = [
  ReconciliationMatchTier.REFERENCE,
  ReconciliationMatchTier.AMOUNT_DATE,
  ReconciliationMatchTier.FUZZY,
  ReconciliationMatchTier.MANUAL,
];

export const RECONCILIATION_MATCH_TIER_LABELS: Record<
  ReconciliationMatchTier,
  string
> = {
  [ReconciliationMatchTier.REFERENCE]: 'Khớp theo tham chiếu',
  [ReconciliationMatchTier.AMOUNT_DATE]: 'Khớp theo số tiền + ngày',
  [ReconciliationMatchTier.FUZZY]: 'Gợi ý theo diễn giải',
  [ReconciliationMatchTier.MANUAL]: 'Khớp thủ công',
};

/**
 * Loại chứng từ nội bộ mà một dòng sao kê có thể khớp vào (mục 10.B — P2.3).
 *
 * Chỉ gồm những thứ **đại diện cho dòng tiền thật**:
 * - `payment`        : phiếu thu / phiếu chi đã ghi sổ (10.A).
 * - `journal_entry`  : bút toán nhập tay (phí/lãi ngân hàng) đã ghi sổ.
 *
 * Hóa đơn chưa thanh toán **không** nằm đây — công nợ không phải dòng tiền; khi
 * thu tiền, nó được phân bổ qua `allocations` chứ không được khớp trực tiếp với
 * sao kê (giữ một đường đi duy nhất cho công nợ).
 */
export enum ReconciliationMatchTargetType {
  PAYMENT = 'payment',
  JOURNAL_ENTRY = 'journal_entry',
}

export const ALL_RECONCILIATION_MATCH_TARGET_TYPES: readonly ReconciliationMatchTargetType[] =
  Object.values(ReconciliationMatchTargetType);

export const RECONCILIATION_MATCH_TARGET_TYPE_LABELS: Record<
  ReconciliationMatchTargetType,
  string
> = {
  [ReconciliationMatchTargetType.PAYMENT]: 'Phiếu thu/chi',
  [ReconciliationMatchTargetType.JOURNAL_ENTRY]: 'Bút toán',
};
