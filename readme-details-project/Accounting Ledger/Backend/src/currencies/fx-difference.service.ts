import { BadRequestException, Injectable } from '@nestjs/common';

import { AccountsService } from '../accounts/accounts.service.js';
import {
  FxDifferenceKind,
  FX_DIFFERENCE_KIND_LABELS,
  fxAccountPrefix,
} from '../common/enums/fx-difference.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { fxDifference } from '../common/utils/currency.util.js';
import {
  isPositiveMoney,
  moneyEquals,
  moneyToString,
  toMoney,
} from '../common/utils/money.util.js';
import {
  isPartyAccount,
  partyAccountMessage,
  partyAccountSide,
} from '../common/utils/party-account.util.js';
import type { CreateJournalEntryDto } from '../journals/dto/create-journal-entry.dto.js';
import { PartiesService } from '../parties/parties.service.js';
import type { CreateFxDifferenceDto } from './dto/create-fx-difference.dto.js';

/** Kết quả tính chênh lệch tỷ giá (chưa hạch toán). */
export interface FxDifferenceResult {
  kind: FxDifferenceKind;
  kindLabel: string;
  /** Giá trị tuyệt đối của chênh lệch, tiền hạch toán. */
  amount: string;
  /** Chênh lệch **có dấu** (`settled − booked`): dương = tất toán nhiều hơn. */
  signedDifference: string;
  /** Chiều công nợ suy ra từ tiền tố tài khoản. */
  side: 'receivable' | 'payable';
  /** Tài khoản chênh lệch được dùng (515 / 635 / 413). */
  differenceAccountPrefix: string;
}

/**
 * Chênh lệch tỷ giá khi **tất toán ở tỷ giá khác** (mục 10.C.1).
 *
 * ## Vì sao cần bút toán riêng
 *
 * `debit`/`credit` luôn là tiền hạch toán (quyết định #3). Công nợ được ghi nhận ở
 * tỷ giá ngày lập chứng từ, nhưng tất toán ở tỷ giá ngày thu/trả. Vì vậy sau khi
 * thu/trả **đủ ngoại tệ**, tài khoản công nợ (131/331) vẫn còn số dư — phần dư đó
 * *chính là* chênh lệch tỷ giá, và phải được kết chuyển, nếu không công nợ của đối
 * tượng sai vĩnh viễn.
 *
 * ## Quy tắc dấu (điểm dễ sai nhất)
 *
 * Cùng một con số mang nghĩa **ngược nhau** tuỳ chiều công nợ:
 *
 * | Chiều | Tất toán nhiều hơn giá trị ghi nhận | Kết quả |
 * | ----- | ---------------------------------- | ------- |
 * | Phải thu (131) | khách trả nhiều hơn | **lãi** |
 * | Phải trả (331) | mình trả nhiều hơn | **lỗ** |
 *
 * Bút toán luôn có dạng (sau khi biết lãi/lỗ):
 * - **Lãi**: Nợ *tài khoản công nợ* / Có 515
 * - **Lỗ**: Nợ 635 / Có *tài khoản công nợ*
 *
 * Chứng minh bằng số dư: tài khoản công nợ sau khi tất toán đủ ngoại tệ luôn lệch về
 * phía **ngược** số dư tự nhiên; dòng chênh lệch có tác dụng triệt tiêu đúng phần
 * lệch đó, và tài khoản đối ứng (515/635) nhận phần lãi/lỗ.
 *
 * ## 413 vs 515/635
 *
 * - `realized_*` — đã thu/trả tiền thật ⇒ 515 (lãi) hoặc 635 (lỗ).
 * - `unrealized` — **đánh giá lại số dư ngoại tệ cuối kỳ**, chưa thực hiện ⇒ 413.
 *   Bút toán này phải hoàn nhập ở kỳ sau; nó không phải lãi/lỗ thật.
 *
 * Service này **chỉ tính và dựng DTO** — việc ghi sổ do `JournalsService` làm, đúng
 * quyết định #1 "không có bộ máy ghi sổ thứ hai".
 */
@Injectable()
export class FxDifferenceService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly parties: PartiesService,
  ) {}

  /** Tính chênh lệch mà **không** chạm DB ngoài việc giải tài khoản. */
  async compute(dto: CreateFxDifferenceDto): Promise<FxDifferenceResult> {
    const account = await this.accounts.getPostable(dto.partyAccountId);
    if (!isPartyAccount(account.code)) {
      throw new BadRequestException(partyAccountMessage(account.code));
    }

    const side = partyAccountSide(account.code);
    if (!side) {
      // `isPartyAccount` đã bảo đảm 131/331, nên nhánh này chỉ chạy nếu ai đó thêm
      // tiền tố mới vào `PARTY_ACCOUNT_PREFIXES` mà quên cập nhật `partyAccountSide`.
      throw new BadRequestException(
        `Không xác định được chiều công nợ của tài khoản ${account.code}`,
      );
    }

    const signed = toMoney(
      fxDifference(dto.bookedBaseAmount, dto.settledBaseAmount),
    );

    const kind = this.resolveKind(dto.kind, side, signed);

    return {
      kind,
      kindLabel: FX_DIFFERENCE_KIND_LABELS[kind],
      amount: moneyToString(signed.abs()),
      signedDifference: moneyToString(signed),
      side,
      differenceAccountPrefix: fxAccountPrefix(kind),
    };
  }

  /**
   * Dựng bút toán chênh lệch hoàn chỉnh, sẵn sàng đưa cho `JournalsService`.
   *
   * Trả `null` khi chênh lệch bằng 0: **không** tạo bút toán rỗng. Đây là trường hợp
   * phổ biến nhất (tất toán đúng tỷ giá gốc) nên nó phải là đường rẻ, không phải lỗi.
   */
  async buildEntry(
    dto: CreateFxDifferenceDto,
  ): Promise<CreateJournalEntryDto | null> {
    const result = await this.compute(dto);
    if (moneyEquals(result.amount, 0)) {
      return null;
    }

    const account = await this.accounts.getPostable(dto.partyAccountId);
    const party = await this.parties.resolveActive(dto.partyId);
    const differenceAccount = await this.accounts.requirePostableByCodePrefix(
      result.differenceAccountPrefix,
      this.differenceAccountHint(result.kind),
    );

    const description = this.describe(dto, result, account.code, party.name);
    const partyLine = {
      accountId: account.id,
      partyId: party.id,
      description,
    };

    // Lãi: Nợ công nợ / Có 515 — Lỗ: Nợ 635 / Có công nợ.
    const isGain = this.isGain(result.kind, result.signedDifference);
    const lines = isGain
      ? [
          { ...partyLine, debit: result.amount },
          { accountId: differenceAccount.id, credit: result.amount, description },
        ]
      : [
          { accountId: differenceAccount.id, debit: result.amount, description },
          { ...partyLine, credit: result.amount },
        ];

    return {
      date: dto.date,
      description,
      sourceType: SourceType.MANUAL,
      lines,
    };
  }

  /**
   * Suy ra loại chênh lệch.
   *
   * Nếu người dùng khai tường minh thì tôn trọng (kể cả khi dấu "trông ngược" — họ có
   * thể đang cố ý hạch toán bù). Nếu bỏ trống thì **tự suy** từ chiều công nợ và dấu,
   * vì đây là phép tính mà làm sai sẽ đảo lãi thành lỗ.
   */
  private resolveKind(
    requested: FxDifferenceKind | undefined,
    side: 'receivable' | 'payable',
    signed: ReturnType<typeof toMoney>,
  ): FxDifferenceKind {
    // Khai tường minh thì tôn trọng tuyệt đối: người dùng có thể đang cố ý hạch toán
    // một chiều khác với suy luận tự động (vd bù trừ sai sót kỳ trước).
    if (requested === FxDifferenceKind.UNREALIZED) {
      return FxDifferenceKind.UNREALIZED;
    }
    if (requested === FxDifferenceKind.REALIZED_GAIN) {
      return FxDifferenceKind.REALIZED_GAIN;
    }
    if (requested === FxDifferenceKind.REALIZED_LOSS) {
      return FxDifferenceKind.REALIZED_LOSS;
    }

    // Phải thu: thu nhiều hơn giá trị ghi nhận ⇒ lãi. Phải trả: trả nhiều hơn ⇒ lỗ.
    const gain =
      side === 'receivable' ? signed.greaterThan(0) : signed.lessThan(0);

    return gain
      ? FxDifferenceKind.REALIZED_GAIN
      : FxDifferenceKind.REALIZED_LOSS;
  }

  /** Lãi hay lỗ — với 413 (đánh giá lại) thì suy từ dấu chênh lệch. */
  private isGain(kind: FxDifferenceKind, signedDifference: string): boolean {
    if (kind === FxDifferenceKind.REALIZED_GAIN) return true;
    if (kind === FxDifferenceKind.REALIZED_LOSS) return false;
    // 413: đánh giá lại làm tăng giá trị tài sản/công nợ ⇒ dấu dương ⇒ ghi tăng.
    return isPositiveMoney(signedDifference);
  }

  private describe(
    dto: CreateFxDifferenceDto,
    result: FxDifferenceResult,
    partyAccountCode: string,
    partyName: string,
  ): string {
    if (dto.description?.trim()) {
      return dto.description.trim();
    }
    const currency = dto.currency ? ` ${dto.currency.toUpperCase()}` : '';
    return (
      `${result.kindLabel}${currency} — ${partyName} (TK ${partyAccountCode}), ` +
      `chênh lệch ${result.amount}`
    );
  }

  private differenceAccountHint(kind: FxDifferenceKind): string {
    switch (kind) {
      case FxDifferenceKind.REALIZED_GAIN:
        return 'tài khoản doanh thu hoạt động tài chính (515*)';
      case FxDifferenceKind.REALIZED_LOSS:
        return 'tài khoản chi phí tài chính (635*)';
      case FxDifferenceKind.UNREALIZED:
        return 'tài khoản chênh lệch tỷ giá hối đoái (413*)';
    }
  }
}
