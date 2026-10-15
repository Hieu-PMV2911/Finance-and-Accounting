import { BadRequestException, ConflictException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import { TaxType } from '../common/enums/tax-code.enum.js';
import { TaxCodesService } from './tax-codes.service.js';
import type { TaxCode } from './entities/tax-code.entity.js';

/**
 * Mục 10.C.2 — bộ máy thuế.
 *
 * Ba bất biến được chốt ở đây, vì build xanh không bắt được:
 * - thuế suất được **sao lại** vào dòng (sửa danh mục không đổi chứng từ cũ);
 * - tổng thuế của chứng từ = **tổng các dòng đã làm tròn**, và một con số khai sẵn mà
 *   lệch thì **bị từ chối** chứ không tự sửa cho khớp;
 * - dòng thuế ghi sổ gom theo **tài khoản đích**, không theo mã thuế.
 */
const UUID = '22222222-2222-4222-8222-222222222222';

function taxCode(overrides: Partial<TaxCode> = {}): TaxCode {
  return {
    id: UUID,
    code: 'VAT10',
    name: 'Thuế GTGT 10%',
    type: TaxType.VAT,
    rate: '10.0000',
    outputAccountId: null,
    inputAccountId: null,
    outputAccount: null,
    inputAccount: null,
    isActive: true,
    description: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as TaxCode;
}

function createService(
  codes: TaxCode[],
  options: { configuredAccount?: { id: string; code: string } } = {},
): {
  service: TaxCodesService;
  repository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  accounts: {
    getPostable: ReturnType<typeof vi.fn>;
    requirePostableByCodePrefix: ReturnType<typeof vi.fn>;
  };
} {
  const repository = {
    findOne: vi.fn(async ({ where }: { where: { id?: string; code?: string } }) =>
      codes.find((code) => code.id === where.id || code.code === where.code) ?? null,
    ),
    save: vi.fn(async (entity: TaxCode) => entity),
    create: vi.fn((entity: Partial<TaxCode>) => entity),
    remove: vi.fn(async () => undefined),
    createQueryBuilder: vi.fn(),
  };
  const accounts = {
    getPostable: vi.fn(async () => options.configuredAccount ?? { id: 'acc-3331', code: '3331' }),
    requirePostableByCodePrefix: vi.fn(async () => ({ id: 'acc-3331', code: '3331' })),
  };
  const dataSource = { query: vi.fn(async () => [{ count: '0' }]) };

  return {
    service: new TaxCodesService(
      repository as never,
      accounts as never,
      dataSource as never,
    ),
    repository,
    accounts,
  };
}

describe('TaxCodesService', () => {
  describe('resolveLineTax — sao lại thuế suất vào dòng', () => {
    it('dòng không khai mã thuế ⇒ thuế suất 0, không tham chiếu danh mục', async () => {
      const { service, repository } = createService([]);

      const resolved = await service.resolveLineTax(null);

      expect(resolved).toEqual({ taxCodeId: null, taxCode: null, taxRate: '0.0000' });
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('trả thuế suất đã chuẩn hóa 4 chữ số + mã dạng chữ', async () => {
      const { service } = createService([taxCode()]);

      const resolved = await service.resolveLineTax(UUID);

      expect(resolved).toEqual({
        taxCodeId: UUID,
        taxCode: 'VAT10',
        taxRate: '10.0000',
      });
    });

    it('mã thuế đã ngừng sử dụng ⇒ từ chối (không áp cho chứng từ mới)', async () => {
      const { service } = createService([taxCode({ isActive: false })]);

      await expect(service.resolveLineTax(UUID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resolveDocumentTaxes — tổng thuế của chứng từ', () => {
    it('không khai sẵn ⇒ tổng thuế = tổng các dòng đã làm tròn', async () => {
      const { service } = createService([taxCode()]);

      const result = await service.resolveDocumentTaxes(
        [{ amount: '1000000', taxCodeId: UUID }, { amount: '500000' }],
        undefined,
        'hóa đơn bán',
      );

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toMatchObject({
        taxCodeId: UUID,
        taxRate: '10.0000',
        taxAmount: '100000.0000',
      });
      expect(result.lines[1]).toMatchObject({
        taxCodeId: null,
        taxAmount: '0.0000',
      });
      expect(result.headerTax.equals(new Decimal('100000'))).toBe(true);
    });

    it('khai sẵn khớp tổng dòng ⇒ nhận đúng số đã khai', async () => {
      const { service } = createService([taxCode()]);

      const result = await service.resolveDocumentTaxes(
        [{ amount: '1000000', taxCodeId: UUID }],
        '100000.0000',
        'hóa đơn bán',
      );

      expect(result.headerTax.equals(new Decimal('100000'))).toBe(true);
    });

    it('khai sẵn lệch tổng dòng ⇒ từ chối, KHÔNG tự sửa cho khớp', async () => {
      const { service } = createService([taxCode()]);

      await expect(
        service.resolveDocumentTaxes(
          [{ amount: '1000000', taxCodeId: UUID }],
          '50000.0000',
          'hóa đơn bán',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('groupVatByAccount — gom thuế để sinh dòng bút toán', () => {
    it('gom theo tài khoản đích và bỏ dòng không chịu thuế', async () => {
      const { service } = createService([taxCode()]);

      const groups = await service.groupVatByAccount(
        [
          { taxAmount: '100000.0000', taxCodeId: UUID },
          { taxAmount: '50000.0000', taxCodeId: UUID },
          { taxAmount: '0.0000', taxCodeId: null },
        ],
        'output',
      );

      expect(groups).toEqual([{ accountId: 'acc-3331', amount: '150000.0000' }]);
    });

    it('không có dòng chịu thuế ⇒ không sinh nhóm nào', async () => {
      const { service } = createService([]);

      const groups = await service.groupVatByAccount(
        [{ taxAmount: '0.0000', taxCodeId: null }],
        'input',
      );

      expect(groups).toEqual([]);
    });
  });

  describe('resolveVatAccount — tài khoản thuế để ghi sổ', () => {
    it('chưa khai tài khoản ⇒ rơi về tiền tố 3331/1331', async () => {
      const { service, accounts } = createService([taxCode()]);

      await service.resolveVatAccount(taxCode(), 'output');
      expect(accounts.requirePostableByCodePrefix).toHaveBeenCalledWith(
        '3331',
        expect.any(String),
      );

      await service.resolveVatAccount(taxCode(), 'input');
      expect(accounts.requirePostableByCodePrefix).toHaveBeenCalledWith(
        '1331',
        expect.any(String),
      );
    });

    it('đã khai tài khoản trên mã thuế ⇒ dùng tài khoản đó', async () => {
      const { service, accounts } = createService([], {
        configuredAccount: { id: 'acc-33311', code: '33311' },
      });

      const account = await service.resolveVatAccount(
        taxCode({ outputAccountId: 'acc-33311' }),
        'output',
      );

      expect(account.id).toBe('acc-33311');
      expect(accounts.getPostable).toHaveBeenCalledWith('acc-33311');
      expect(accounts.requirePostableByCodePrefix).not.toHaveBeenCalled();
    });
  });

  describe('create — kiểm tra thuế suất', () => {
    it('thuế suất ngoài [0, 100] ⇒ từ chối', async () => {
      const { service } = createService([]);

      await expect(
        service.create({ code: 'BAD', name: 'Sai', rate: '1000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mã thuế trùng ⇒ xung đột', async () => {
      const { service } = createService([taxCode()]);

      await expect(
        service.create({ code: 'vat10', name: 'Trùng', rate: '10' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
