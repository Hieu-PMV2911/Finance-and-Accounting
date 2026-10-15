/**
 * Chênh lệch tỷ giá (mục 10.C.1).
 *
 * Bất biến của quyết định #3: `journal_lines.debit`/`credit` **luôn** là tiền hạch
 * toán (`companies.baseCurrency`). Ngoại tệ nằm ở `currency`/`fx_amount`/`fx_rate`
 * trên cùng dòng. Hệ quả trực tiếp: khi tỷ giá lúc **tất toán** khác tỷ giá lúc
 * **ghi nhận**, tài khoản công nợ (131/331) không về 0 dù đã thu/trả đủ ngoại tệ —
 * phần còn lại chính là chênh lệch tỷ giá và phải được kết chuyển sang tài khoản
 * chênh lệch, nếu không số dư công nợ sẽ sai mãi.
 *
 * Ánh xạ tài khoản theo TT200:
 * - Lãi tỷ giá **đã thực hiện** (đã thu/trả) → **Có 515** (doanh thu hoạt động tài chính).
 * - Lỗ tỷ giá **đã thực hiện** → **Nợ 635** (chi phí tài chính).
 * - Chênh lệch **đánh giá lại cuối kỳ** (chưa thực hiện) → **413** (chênh lệch tỷ giá
 *   hối đoái). Đây là bút toán của kỳ, sẽ hoàn nhập ở kỳ sau — không phải lãi/lỗ thật.
 */
export enum FxDifferenceKind {
  /** Tất toán thu được nhiều tiền hạch toán hơn giá trị đã ghi nhận ⇒ lãi. */
  REALIZED_GAIN = 'realized_gain',
  /** Tất toán thu được ít tiền hạch toán hơn giá trị đã ghi nhận ⇒ lỗ. */
  REALIZED_LOSS = 'realized_loss',
  /** Đánh giá lại số dư ngoại tệ cuối kỳ — chưa thực hiện, dùng TK 413. */
  UNREALIZED = 'unrealized',
}

export const ALL_FX_DIFFERENCE_KINDS: readonly FxDifferenceKind[] =
  Object.values(FxDifferenceKind);

export const FX_DIFFERENCE_KIND_LABELS: Record<FxDifferenceKind, string> = {
  [FxDifferenceKind.REALIZED_GAIN]: 'Lãi tỷ giá đã thực hiện',
  [FxDifferenceKind.REALIZED_LOSS]: 'Lỗ tỷ giá đã thực hiện',
  [FxDifferenceKind.UNREALIZED]: 'Chênh lệch đánh giá lại cuối kỳ',
};

/** TK 515 — doanh thu hoạt động tài chính (lãi tỷ giá đã thực hiện). */
export const FX_GAIN_ACCOUNT_PREFIX = '515';

/** TK 635 — chi phí tài chính (lỗ tỷ giá đã thực hiện). */
export const FX_LOSS_ACCOUNT_PREFIX = '635';

/** TK 413 — chênh lệch tỷ giá hối đoái (đánh giá lại cuối kỳ). */
export const FX_REVALUATION_ACCOUNT_PREFIX = '413';

/**
 * Tiền tố tài khoản chênh lệch ứng với từng loại.
 *
 * Là **lưới an toàn** giống `AccountDefaultsService`: nếu hệ thống tài khoản chưa
 * khai tài khoản chi tiết thì vẫn có đích đến xác định, và nơi gọi không phải
 * quyết định lại.
 */
export function fxAccountPrefix(kind: FxDifferenceKind): string {
  switch (kind) {
    case FxDifferenceKind.REALIZED_GAIN:
      return FX_GAIN_ACCOUNT_PREFIX;
    case FxDifferenceKind.REALIZED_LOSS:
      return FX_LOSS_ACCOUNT_PREFIX;
    case FxDifferenceKind.UNREALIZED:
      return FX_REVALUATION_ACCOUNT_PREFIX;
  }
}

/**
 * Chiều của tài khoản chênh lệch trong bút toán.
 *
 * - Lãi (515) là **thu nhập** ⇒ nằm bên Có.
 * - Lỗ (635) là **chi phí** ⇒ nằm bên Nợ.
 * - Đánh giá lại (413) phụ thuộc dấu chênh lệch, nên được truyền vào từ kết quả tính.
 */
export function fxAccountSide(kind: FxDifferenceKind): 'debit' | 'credit' | 'signed' {
  switch (kind) {
    case FxDifferenceKind.REALIZED_GAIN:
      return 'credit';
    case FxDifferenceKind.REALIZED_LOSS:
      return 'debit';
    case FxDifferenceKind.UNREALIZED:
      return 'signed';
  }
}
