import { Decimal } from 'decimal.js';

import { BankTransactionDirection } from './enums/bank-transaction.enum.js';
import { ReconciliationMatchTier } from './enums/bank-transaction.enum.js';

/**
 * Đối ứng nội bộ có thể khớp với một dòng sao kê (mục 10.B — P2.3).
 *
 * Ở đây chỉ mô tả **hình dạng tối thiểu** để util khớp thuần: không phụ thuộc
 * entity nào, nên bài kiểm thử không cần dựng cả service.
 */
export interface MatchCandidate {
  id: string;
  /** Số chứng từ (phiếu thu/chi, hóa đơn…) — chìa khóa khớp tầng 1 & 3. */
  code: string;
  /** Tham chiếu (nếu có) — cũng dùng cho tầng 1. */
  reference: string | null;
  /** Số tiền **còn lại** của chứng từ (đã trừ phần đã phân bổ). */
  amount: string;
  /** Ngày chứng từ (YYYY-MM-DD). */
  date: string;
  direction: BankTransactionDirection;
}

/** Dòng sao kê đã chuẩn hóa — đầu ra adapter. */
export interface MatchTransaction {
  id: string;
  bankRef: string | null;
  reference: string | null;
  amount: string;
  transactionDate: string;
  description: string | null;
  direction: BankTransactionDirection;
}

/** Kết quả một lần khớp. */
export interface MatchOutcome {
  candidateId: string | null;
  tier: ReconciliationMatchTier | null;
  /** Số tiền hệ thống gợi ý khớp (≤ số tiền dòng sao). */
  amount: string;
}

/**
 * Số ngày cho phép lệch ở **tầng 2** (số tiền + ngày gần nhau).
 * Đổi bằng biến môi trường `RECONCILIATION_DATE_TOLERANCE_DAYS` (mặc định 3).
 */
export function dateToleranceDays(): number {
  const parsed = Number(process.env.RECONCILIATION_DATE_TOLERANCE_DAYS ?? 3);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 3;
}

/**
 * Khớp **3 tầng** một dòng sao kê với danh sách đối ứng nội bộ.
 *
 * - **Tầng 1 — tham chiếu + tiền**: `bankRef`/`reference` của dòng sao trùng
 *   mã chứng từ hoặc tham chiếu **và** đúng số tiền ⇒ khớp chắc chắn.
 * - **Tầng 2 — tiền + ngày**: đúng số tiền và ngày cách nhau ≤ N ngày ⇒ khớp
 *   chắc chắn (ngân hàng đôi khi để trống mã).
 * - **Tầng 3 — gợi ý mờ**: diễn giải **chứa** mã chứng từ (không so đúng hẳn,
 *   có thể kèm ký tự lạ) ⇒ chỉ là **gợi ý**, phải có người xác nhận.
 *
 * Không có tầng nào khớp ⇒ trả `tier = null` để nơi gọi ghi ngoại lệ
 * `missing_internal` — **không tự đoán**.
 *
 * Thuần: không đụng DB, không đụng entity — test được bằng mảng object thường.
 */
export function matchTransaction(
  transaction: MatchTransaction,
  candidates: readonly MatchCandidate[],
  options: { toleranceDays?: number } = {},
): MatchOutcome {
  const tolerance = options.toleranceDays ?? dateToleranceDays();
  const sameDirection = candidates.filter(
    (candidate) => candidate.direction === transaction.direction,
  );
  const transactionAmount = new Decimal(transaction.amount);

  // Ưu tiên theo tầng: tầng 1 thắng tầng 2 thắng tầng 3. Trong cùng tầng, chọn
  // đối ứng **gần ngày nhất** để kết quả xác định (không phụ thuộc thứ tự).
  const tier1 = pickTier1(transaction, sameDirection, transactionAmount);
  if (tier1) return tier1;

  const tier2 = pickTier2(
    transaction,
    sameDirection,
    transactionAmount,
    tolerance,
  );
  if (tier2) return tier2;

  const tier3 = pickTier3(transaction, sameDirection);
  if (tier3) return tier3;

  return { candidateId: null, tier: null, amount: '0.0000' };
}

// ------------------------------------------------------------------ tầng 1

function pickTier1(
  transaction: MatchTransaction,
  candidates: readonly MatchCandidate[],
  amount: Decimal,
): MatchOutcome | null {
  const keys = [transaction.bankRef, transaction.reference]
    .map((key) => key?.trim().toUpperCase())
    .filter((key): key is string => Boolean(key));

  if (keys.length === 0) return null;

  const matched = candidates.filter((candidate) => {
    const code = candidate.code.trim().toUpperCase();
    const reference = candidate.reference?.trim().toUpperCase() ?? '';
    return keys.includes(code) || (reference !== '' && keys.includes(reference));
  });

  // Tầng 1 chỉ khớp **đúng** số tiền. Sai tiền ⇒ không phải tầng này, và để
  // lại dấu vết cho ngoại lệ `amount_mismatch` (xem service).
  const exact = matched.filter((candidate) =>
    amountEquals(candidate.amount, amount),
  );
  const pick = closestByDate(transaction.transactionDate, exact);
  if (!pick) return null;

  return {
    candidateId: pick.id,
    tier: ReconciliationMatchTier.REFERENCE,
    amount: money4(amount),
  };
}

// ------------------------------------------------------------------ tầng 2

function pickTier2(
  transaction: MatchTransaction,
  candidates: readonly MatchCandidate[],
  amount: Decimal,
  toleranceDays: number,
): MatchOutcome | null {
  const exact = candidates.filter((candidate) =>
    amountEquals(candidate.amount, amount),
  );

  const withinTolerance = exact.filter((candidate) => {
    const gap = dayDifference(candidate.date, transaction.transactionDate);
    return gap !== null && gap <= toleranceDays;
  });

  const pick = closestByDate(transaction.transactionDate, withinTolerance);
  if (!pick) return null;

  return {
    candidateId: pick.id,
    tier: ReconciliationMatchTier.AMOUNT_DATE,
    amount: money4(amount),
  };
}

// ------------------------------------------------------------------ tầng 3

/**
 * Gợi ý mờ: diễn giải chứa **mã chứng từ** ở dạng "từ đầy đủ" (tách theo ranh
 * giới ký tự chữ/số) — tránh khớp nhầm chuỗi con ngắn (`PT1` khớp `PT12`).
 */
function pickTier3(
  transaction: MatchTransaction,
  candidates: readonly MatchCandidate[],
): MatchOutcome | null {
  const description = tokenize(transaction.description ?? '');
  if (description.size === 0) return null;

  const matched = candidates.filter((candidate) =>
    tokenize(candidate.code).size > 0 &&
    [...tokenize(candidate.code)].every((token) => description.has(token)),
  );

  const pick = closestByDate(transaction.transactionDate, matched);
  if (!pick) return null;

  return {
    candidateId: pick.id,
    tier: ReconciliationMatchTier.FUZZY,
    // Gợi ý mờ: khớp **toàn bộ** số tiền dòng sao làm đề xuất, nhưng số tiền
    // thật do người xác nhận khi tạo dòng khớp thủ công.
    amount: money4(transaction.amount),
  };
}

// -------------------------------------------------------------- tiện ích

/**
 * Tách chuỗi thành tập token chữ/số viết hoa.
 *
 * `PT-2026-0001` ⇒ `{PT, 2026, 0001}`. Dùng chung cho cả hai bên nên tầng 3
 * so được mã có/không có dấu phân cách.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

/** Số ngày tuyệt đối giữa hai ngày ISO (null nếu không parse được). */
function dayDifference(a: string, b: string): number | null {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(left - right) / 86_400_000;
}

/** Chọn đối ứng có ngày gần ngày dòng sao nhất; null nếu danh sách rỗng. */
function closestByDate(
  transactionDate: string,
  candidates: readonly MatchCandidate[],
): MatchCandidate | null {
  let best: MatchCandidate | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const gap = dayDifference(candidate.date, transactionDate) ?? 0;
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

function amountEquals(a: string, b: Decimal | string): boolean {
  return new Decimal(a).equals(new Decimal(b));
}

function money4(value: Decimal | string): string {
  return new Decimal(value).toDecimalPlaces(4).toFixed(4);
}
