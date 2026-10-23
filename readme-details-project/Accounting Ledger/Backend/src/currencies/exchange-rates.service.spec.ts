import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator, type Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompaniesService } from '../companies/companies.service.js';
import type { CurrenciesService } from './currencies.service.js';
import type { ExchangeRate } from './entities/exchange-rate.entity.js';
import { ExchangeRatesService } from './exchange-rates.service.js';

/** Trích giá trị so sánh từ `FindOperator` (hoặc trả chính giá trị nếu là thô). */
function operatorValue(value: unknown): { op: string | null; value: unknown } {
  if (value instanceof FindOperator) {
    return { op: value.type, value: value.value };
  }
  return { op: null, value };
}

function makeRate(partial: Partial<ExchangeRate>): ExchangeRate {
  return {
    id: 'rate-1',
    currencyCode: 'USD',
    rateDate: '2026-03-01',
    rate: '24500.00000000',
    source: 'manual',
    note: null,
    ...partial,
  } as ExchangeRate;
}

/**
 * Repository giả tối thiểu: đủ để kiểm tra **quy tắc tra cứu** của service.
 *
 * `findOne` mô phỏng đúng hai dạng truy vấn service dùng: theo khóa chính xác và
 * theo `rateDate <= asOfDate` (sắp giảm dần). Nhờ vậy test kiểm chứng được hành vi
 * "lấy tỷ giá của ngày gần nhất không muộn hơn", chứ không chỉ kiểm tra service có
 * gọi repository hay không.
 */
function build() {
  let rows: ExchangeRate[] = [];

  const repo = {
    __rows: () => rows,
    findOne: vi.fn(async (options: Record<string, unknown>) => {
      const where = (options.where ?? {}) as Record<string, unknown>;
      const matches = rows.filter((row) =>
        Object.entries(where).every(([key, condition]) => {
          const { op, value } = operatorValue(condition);
          const actual = (row as unknown as Record<string, unknown>)[key];
          if (op === 'lessThanOrEqual') return String(actual) <= String(value);
          return actual === value;
        }),
      );
      const order = options.order as Record<string, 'ASC' | 'DESC'> | undefined;
      if (order) {
        for (const [key, direction] of Object.entries(order)) {
          matches.sort((a, b) => {
            const av = String((a as unknown as Record<string, unknown>)[key]);
            const bv = String((b as unknown as Record<string, unknown>)[key]);
            return direction === 'DESC' ? bv.localeCompare(av) : av.localeCompare(bv);
          });
        }
      }
      return matches[0] ?? null;
    }),
    create: vi.fn((value: Partial<ExchangeRate>) => value as ExchangeRate),
    save: vi.fn(async (value: ExchangeRate) => {
      const index = rows.findIndex((row) => row.id === value.id);
      const saved = { ...value, id: value.id ?? `rate-${rows.length + 1}` };
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved;
    }),
    remove: vi.fn(async (value: ExchangeRate) => {
      rows = rows.filter((row) => row.id !== value.id);
      return value;
    }),
    createQueryBuilder: vi.fn(() => ({
      orderBy: () => ({
        addOrderBy: () => ({
          take: () => ({
            skip: () => ({ getMany: async () => rows }),
          }),
        }),
      }),
      andWhere: () => ({ getMany: async () => rows }),
    })),
  };

  const currencies = {
    findActive: vi.fn(async (code: string) =>
      code === 'USD' ? { code: 'USD', name: 'Đô la Mỹ', isActive: true } : null,
    ),
    list: vi.fn(async () => [
      { code: 'VND', isBase: true, isActive: true },
      { code: 'USD', isBase: false, isActive: true },
    ]),
  };

  const companies = {
    baseCurrency: vi.fn(async () => 'VND'),
  };

  const service = new ExchangeRatesService(
    repo as unknown as Repository<ExchangeRate>,
    currencies as unknown as CurrenciesService,
    companies as unknown as CompaniesService,
  );

  return { service, repo, currencies, companies, setRows: (next: ExchangeRate[]) => (rows = next) };
}

describe('ExchangeRatesService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('findApplicable — quy tắc "ngày gần nhất không muộn hơn"', () => {
    it('lấy tỷ giá của ngày gần nhất KHÔNG muộn hơn ngày cần tra', async () => {
      const ctx = build();
      ctx.setRows([
        makeRate({ id: 'r1', rateDate: '2026-03-01', rate: '24500.00000000' }),
        makeRate({ id: 'r2', rateDate: '2026-03-05', rate: '24600.00000000' }),
        makeRate({ id: 'r3', rateDate: '2026-03-20', rate: '24900.00000000' }),
      ]);

      const resolved = await ctx.service.findApplicable('USD', '2026-03-10');

      expect(resolved?.rate).toBe('24600.00000000');
      expect(resolved?.rateDate).toBe('2026-03-05');
      expect(resolved?.fallback).toBe(true);
    });

    it('đúng ngày thì KHÔNG đánh dấu fallback', async () => {
      const ctx = build();
      ctx.setRows([makeRate({ rateDate: '2026-03-10' })]);

      const resolved = await ctx.service.findApplicable('USD', '2026-03-10');

      expect(resolved?.fallback).toBe(false);
    });

    it('KHÔNG dùng tỷ giá của tương lai', async () => {
      const ctx = build();
      ctx.setRows([makeRate({ rateDate: '2026-03-20' })]);

      const resolved = await ctx.service.findApplicable('USD', '2026-03-10');

      expect(resolved).toBeNull();
    });

    it('đơn vị tiền hạch toán luôn có tỷ giá 1, không cần bản ghi', async () => {
      const ctx = build();
      const resolved = await ctx.service.findApplicable('VND', '2026-03-10');

      expect(resolved?.rate).toBe('1.00000000');
      expect(resolved?.source).toBe('base');
      expect(ctx.repo.findOne).not.toHaveBeenCalled();
    });

    it('chuẩn hóa mã tiền trước khi tra', async () => {
      const ctx = build();
      ctx.setRows([makeRate({ rateDate: '2026-03-01' })]);

      const resolved = await ctx.service.findApplicable('  usd ', '2026-03-10');

      expect(resolved?.currency).toBe('USD');
    });
  });

  describe('requireRate — thiếu tỷ giá là lỗi chặn', () => {
    it('chưa có tỷ giá ⇒ 400 kèm hướng dẫn khai tỷ giá', async () => {
      const ctx = build();
      await expect(ctx.service.requireRate('USD', '2026-03-10')).rejects.toThrow(
        BadRequestException,
      );
      await expect(ctx.service.requireRate('USD', '2026-03-10')).rejects.toThrow(
        /Chưa có tỷ giá cho USD/,
      );
    });
  });

  describe('convert', () => {
    it('quy đổi theo tỷ giá áp dụng và trả cả ngày tỷ giá đã dùng', async () => {
      const ctx = build();
      ctx.setRows([makeRate({ rateDate: '2026-03-01', rate: '24500.00000000' })]);

      const result = await ctx.service.convert('1000', 'USD', '2026-03-10');

      expect(result.baseAmount).toBe('24500000.0000');
      expect(result.rateDate).toBe('2026-03-01');
    });
  });

  describe('upsert', () => {
    it('từ chối khai tỷ giá cho chính đơn vị tiền hạch toán', async () => {
      const ctx = build();
      await expect(
        ctx.service.upsert({ currency: 'VND', rateDate: '2026-03-10', rate: '1' }),
      ).rejects.toThrow(/đơn vị tiền hạch toán/);
    });

    it('từ chối loại tiền chưa khai trong danh mục (báo rõ thay vì lỗi khóa ngoại)', async () => {
      const ctx = build();
      await expect(
        ctx.service.upsert({ currency: 'EUR', rateDate: '2026-03-10', rate: '26000' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('từ chối tỷ giá <= 0', async () => {
      const ctx = build();
      await expect(
        ctx.service.upsert({ currency: 'USD', rateDate: '2026-03-10', rate: '0' }),
      ).rejects.toThrow(/lớn hơn 0/);
    });

    it('ghi cùng (mã tiền, ngày) là CẬP NHẬT, không tạo dòng thứ hai', async () => {
      const ctx = build();
      ctx.setRows([
        makeRate({ id: 'r1', rateDate: '2026-03-10', rate: '24500.00000000' }),
      ]);

      await ctx.service.upsert({
        currency: 'USD',
        rateDate: '2026-03-10',
        rate: '24700',
        note: 'Sửa lại tỷ giá',
      });

      expect(ctx.repo.__rows()).toHaveLength(1);
      expect(ctx.repo.__rows()[0].rate).toBe('24700.00000000');
      expect(ctx.repo.__rows()[0].note).toBe('Sửa lại tỷ giá');
    });

    it('ngày mới ⇒ thêm bản ghi mới, chuẩn hóa tỷ giá 8 chữ số', async () => {
      const ctx = build();

      await ctx.service.upsert({
        currency: 'USD',
        rateDate: '2026-03-11',
        rate: '24700',
      });

      expect(ctx.repo.__rows()).toHaveLength(1);
      expect(ctx.repo.__rows()[0].rate).toBe('24700.00000000');
      expect(ctx.repo.__rows()[0].source).toBe('manual');
    });
  });
});
