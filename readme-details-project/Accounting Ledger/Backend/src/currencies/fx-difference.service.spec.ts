import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FxDifferenceKind } from '../common/enums/fx-difference.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { PartiesService } from '../parties/parties.service.js';
import type { CreateFxDifferenceDto } from './dto/create-fx-difference.dto.js';
import { FxDifferenceService } from './fx-difference.service.js';

const RECEIVABLE = 'account-131';
const PAYABLE = 'account-331';
const GAIN_ACCOUNT = 'account-515';
const LOSS_ACCOUNT = 'account-635';
const REVALUATION_ACCOUNT = 'account-413';

/** Tài khoản giả theo id — chỉ cần `id` và `code` cho logic chênh lệch. */
const ACCOUNTS: Record<string, { id: string; code: string }> = {
  [RECEIVABLE]: { id: RECEIVABLE, code: '1311' },
  [PAYABLE]: { id: PAYABLE, code: '3311' },
  'account-511': { id: 'account-511', code: '5111' },
  [GAIN_ACCOUNT]: { id: GAIN_ACCOUNT, code: '5151' },
  [LOSS_ACCOUNT]: { id: LOSS_ACCOUNT, code: '6351' },
  [REVALUATION_ACCOUNT]: { id: REVALUATION_ACCOUNT, code: '4131' },
};

/** Tiền tố → tài khoản, mô phỏng `AccountsService.requirePostableByCodePrefix`. */
const PREFIX_ACCOUNTS: Record<string, { id: string; code: string }> = {
  '515': ACCOUNTS[GAIN_ACCOUNT],
  '635': ACCOUNTS[LOSS_ACCOUNT],
  '413': ACCOUNTS[REVALUATION_ACCOUNT],
};

function build() {
  const accounts = {
    getPostable: vi.fn(async (id: string) => {
      const found = ACCOUNTS[id];
      if (!found) throw new BadRequestException(`Không tìm thấy tài khoản ${id}`);
      return found;
    }),
    requirePostableByCodePrefix: vi.fn(async (prefix: string) => {
      const found = PREFIX_ACCOUNTS[prefix];
      if (!found) throw new BadRequestException(`Thiếu tài khoản ${prefix}`);
      return found;
    }),
  };

  const parties = {
    resolveActive: vi.fn(async (id: string) => ({
      id,
      code: 'KH001',
      name: 'Khách hàng A',
      isActive: true,
    })),
  };

  const service = new FxDifferenceService(
    accounts as unknown as AccountsService,
    parties as unknown as PartiesService,
  );

  return { service, accounts, parties };
}

/** DTO gốc: phải thu 24,500,000 → tất toán 24,700,000 (thu nhiều hơn). */
function dto(overrides: Partial<CreateFxDifferenceDto> = {}): CreateFxDifferenceDto {
  return {
    date: '2026-03-15',
    partyId: 'party-1',
    partyAccountId: RECEIVABLE,
    bookedBaseAmount: '24500000.0000',
    settledBaseAmount: '24700000.0000',
    currency: 'USD',
    ...overrides,
  };
}

describe('FxDifferenceService', () => {
  describe('quy tắc dấu theo chiều công nợ (điểm dễ sai nhất)', () => {
    it('PHẢI THU, thu nhiều hơn giá trị đã ghi nhận ⇒ LÃI', async () => {
      const { service } = build();
      const result = await service.compute(dto());

      expect(result.side).toBe('receivable');
      expect(result.kind).toBe(FxDifferenceKind.REALIZED_GAIN);
      expect(result.amount).toBe('200000.0000');
      expect(result.differenceAccountPrefix).toBe('515');
    });

    it('PHẢI THU, thu ít hơn giá trị đã ghi nhận ⇒ LỖ', async () => {
      const { service } = build();
      const result = await service.compute(
        dto({ bookedBaseAmount: '24700000.0000', settledBaseAmount: '24500000.0000' }),
      );

      expect(result.kind).toBe(FxDifferenceKind.REALIZED_LOSS);
      expect(result.amount).toBe('200000.0000');
      expect(result.differenceAccountPrefix).toBe('635');
    });

    it('PHẢI TRẢ, trả nhiều hơn giá trị đã ghi nhận ⇒ LỖ (ngược với phải thu)', async () => {
      const { service } = build();
      const result = await service.compute(dto({ partyAccountId: PAYABLE }));

      expect(result.side).toBe('payable');
      expect(result.kind).toBe(FxDifferenceKind.REALIZED_LOSS);
      expect(result.differenceAccountPrefix).toBe('635');
    });

    it('PHẢI TRẢ, trả ít hơn giá trị đã ghi nhận ⇒ LÃI', async () => {
      const { service } = build();
      const result = await service.compute(
        dto({
          partyAccountId: PAYABLE,
          bookedBaseAmount: '24700000.0000',
          settledBaseAmount: '24500000.0000',
        }),
      );

      expect(result.kind).toBe(FxDifferenceKind.REALIZED_GAIN);
      expect(result.differenceAccountPrefix).toBe('515');
    });

    it('giữ dấu chênh lệch trong `signedDifference` để truy vết', async () => {
      const { service } = build();
      const gain = await service.compute(dto());
      const loss = await service.compute(
        dto({ bookedBaseAmount: '24700000.0000', settledBaseAmount: '24500000.0000' }),
      );

      expect(gain.signedDifference).toBe('200000.0000');
      expect(loss.signedDifference).toBe('-200000.0000');
    });
  });

  describe('loại chênh lệch khai tường minh', () => {
    it('`unrealized` dùng TK 413 dù dấu thế nào', async () => {
      const { service } = build();
      const result = await service.compute(
        dto({ kind: FxDifferenceKind.UNREALIZED }),
      );

      expect(result.kind).toBe(FxDifferenceKind.UNREALIZED);
      expect(result.differenceAccountPrefix).toBe('413');
    });

    it('tôn trọng chiều khai tường minh kể cả khi "trông ngược" dấu', async () => {
      const { service } = build();
      // Phải thu + thu nhiều hơn (tự suy ra lãi) nhưng người dùng buộc ghi lỗ.
      const result = await service.compute(
        dto({ kind: FxDifferenceKind.REALIZED_LOSS }),
      );

      expect(result.kind).toBe(FxDifferenceKind.REALIZED_LOSS);
      expect(result.differenceAccountPrefix).toBe('635');
    });
  });

  describe('kiểm tra tài khoản công nợ', () => {
    it('từ chối tài khoản không phải công nợ (131/331)', async () => {
      const { service } = build();
      await expect(
        service.compute(dto({ partyAccountId: 'account-511' })),
      ).rejects.toThrow(/không phải tài khoản công nợ/);
    });
  });

  describe('buildEntry — dựng bút toán', () => {
    it('LÃI ⇒ Nợ tài khoản công nợ / Có 515, có gắn đối tượng trên dòng công nợ', async () => {
      const { service } = build();
      const entry = await service.buildEntry(dto());

      expect(entry).not.toBeNull();
      expect(entry?.sourceType).toBe(SourceType.MANUAL);
      expect(entry?.lines).toHaveLength(2);

      const [partyLine, gainLine] = entry!.lines;
      expect(partyLine.accountId).toBe(RECEIVABLE);
      expect(partyLine.debit).toBe('200000.0000');
      expect(partyLine.credit).toBeUndefined();
      expect(partyLine.partyId).toBe('party-1');
      expect(gainLine.accountId).toBe(GAIN_ACCOUNT);
      expect(gainLine.credit).toBe('200000.0000');
      expect(gainLine.debit).toBeUndefined();
    });

    it('LỖ ⇒ Nợ 635 / Có tài khoản công nợ', async () => {
      const { service } = build();
      // Phải trả + trả NHIỀU hơn giá trị đã ghi nhận ⇒ lỗ (dùng mặc định của `dto()`).
      const entry = await service.buildEntry(dto({ partyAccountId: PAYABLE }));

      const [lossLine, partyLine] = entry!.lines;
      expect(lossLine.accountId).toBe(LOSS_ACCOUNT);
      expect(lossLine.debit).toBe('200000.0000');
      expect(partyLine.accountId).toBe(PAYABLE);
      expect(partyLine.credit).toBe('200000.0000');
      expect(partyLine.partyId).toBe('party-1');
    });

    it('PHẢI TRẢ + trả ÍT hơn ⇒ LÃI, bút toán là Nợ 331 / Có 515', async () => {
      const { service } = build();
      const entry = await service.buildEntry(
        dto({
          partyAccountId: PAYABLE,
          bookedBaseAmount: '24700000.0000',
          settledBaseAmount: '24500000.0000',
        }),
      );

      const [partyLine, gainLine] = entry!.lines;
      expect(partyLine.accountId).toBe(PAYABLE);
      expect(partyLine.debit).toBe('200000.0000');
      expect(gainLine.accountId).toBe(GAIN_ACCOUNT);
      expect(gainLine.credit).toBe('200000.0000');
    });

    it('chênh lệch bằng 0 ⇒ KHÔNG tạo bút toán (trả null), không ném lỗi', async () => {
      const { service } = build();
      const entry = await service.buildEntry(
        dto({ settledBaseAmount: '24500000.0000' }),
      );

      expect(entry).toBeNull();
    });

    it('đánh giá lại cuối kỳ ⇒ dùng TK 413 làm tài khoản đối ứng', async () => {
      const { service } = build();
      const entry = await service.buildEntry(
        dto({ kind: FxDifferenceKind.UNREALIZED }),
      );

      const counterpart = entry!.lines.find((line) =>
        line.accountId === REVALUATION_ACCOUNT,
      );
      expect(counterpart).toBeDefined();
      expect(counterpart?.credit).toBe('200000.0000');
    });

    it('diễn giải mặc định nêu rõ loại chênh lệch, ngoại tệ và đối tượng', async () => {
      const { service } = build();
      const entry = await service.buildEntry(dto());

      expect(entry?.description).toContain('Lãi tỷ giá đã thực hiện');
      expect(entry?.description).toContain('USD');
      expect(entry?.description).toContain('Khách hàng A');
    });

    it('diễn giải do người dùng khai được ưu tiên', async () => {
      const { service } = build();
      const entry = await service.buildEntry(
        dto({ description: 'Kết chuyển chênh lệch tháng 3' }),
      );

      expect(entry?.description).toBe('Kết chuyển chênh lệch tháng 3');
    });
  });
});
