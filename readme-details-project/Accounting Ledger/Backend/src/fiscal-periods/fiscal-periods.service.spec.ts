import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FiscalPeriodStatus } from '../common/enums/fiscal-period-status.enum.js';
import { FiscalPeriod } from './entities/fiscal-period.entity.js';
import { FiscalPeriodsService } from './fiscal-periods.service.js';

// ---------------------------------------------------------------- helpers

function makePeriod(partial: Partial<FiscalPeriod>): FiscalPeriod {
  return {
    id: 'id',
    code: '2026-01',
    name: 'Tháng 01/2026',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: FiscalPeriodStatus.OPEN,
    notes: null,
    createdBy: null,
    lockedAt: null,
    lockedBy: null,
    closedAt: null,
    closedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as FiscalPeriod;
}

/** So khớp `where` có chứa FindOperator của TypeORM (LessThanOrEqual, Not…). */
function matches(
  entity: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const actual = entity[key];
    if (condition instanceof FindOperator) {
      switch (condition.type) {
        case 'lessThanOrEqual':
          return (actual as string) <= (condition.value as string);
        case 'moreThanOrEqual':
          return (actual as string) >= (condition.value as string);
        case 'moreThan':
          return (actual as string) > (condition.value as string);
        case 'lessThan':
          return (actual as string) < (condition.value as string);
        case 'not':
          return actual !== condition.value;
        default:
          throw new Error(`Mock chưa hỗ trợ FindOperator "${condition.type}"`);
      }
    }
    return actual === condition;
  });
}

function createRepoMock(seed: FiscalPeriod[] = []) {
  const store: FiscalPeriod[] = [...seed];
  let seq = 0;

  return {
    _store: store,
    findOne: vi.fn(async (options: { where: Record<string, unknown> }) => {
      const found = store.filter((p) => matches(p, options.where));
      return found[0] ?? null;
    }),
    create: vi.fn((data: Partial<FiscalPeriod>) =>
      makePeriod({ ...data, id: data.id ?? `gen-${++seq}` }),
    ),
    save: vi.fn(async (entity: FiscalPeriod) => {
      const index = store.findIndex((p) => p.id === entity.id);
      if (index === -1) store.push(entity);
      else store[index] = entity;
      return entity;
    }),
    remove: vi.fn(async (entity: FiscalPeriod) => {
      const index = store.indexOf(entity);
      if (index >= 0) store.splice(index, 1);
      return entity;
    }),
  };
}

function buildService(seed: FiscalPeriod[] = []) {
  const periods = createRepoMock(seed);
  const entries = { count: vi.fn(async () => 0) };
  const ledger = {
    carryForwardOpening: vi.fn(async () => 0),
    listByPeriod: vi.fn(async () => []),
  };
  const manager = {
    getRepository: () => periods,
    findOne: periods.findOne,
    save: periods.save,
    find: vi.fn(async () => []),
  };
  const dataSource = {
    transaction: vi.fn(async (run: (m: unknown) => Promise<unknown>) =>
      run(manager),
    ),
  };

  const service = new FiscalPeriodsService(
    periods as never,
    entries as never,
    ledger as never,
    dataSource as never,
  );

  return { service, periods, entries, ledger, manager };
}

// ------------------------------------------------------------------ tests

describe('FiscalPeriodsService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  describe('create', () => {
    it('tạo được kỳ hợp lệ ở trạng thái đang mở', async () => {
      const period = await ctx.service.create(
        {
          code: '2026-01',
          name: 'Tháng 01/2026',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        },
        'user-1',
      );

      expect(period.status).toBe(FiscalPeriodStatus.OPEN);
      expect(period.createdBy).toBe('user-1');
    });

    it('từ chối khi ngày bắt đầu sau ngày kết thúc', async () => {
      await expect(
        ctx.service.create(
          {
            code: '2026-01',
            name: 'Sai khoảng',
            startDate: '2026-01-31',
            endDate: '2026-01-01',
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối ngày không có thật (2026-02-31)', async () => {
      await expect(
        ctx.service.create(
          {
            code: '2026-02',
            name: 'Ngày sai',
            startDate: '2026-02-01',
            endDate: '2026-02-31',
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối mã kỳ trùng', async () => {
      ctx = buildService([makePeriod({ id: 'p1', code: '2026-01' })]);

      await expect(
        ctx.service.create(
          {
            code: '2026-01',
            name: 'Trùng mã',
            startDate: '2026-03-01',
            endDate: '2026-03-31',
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('từ chối khoảng ngày chồng lấn kỳ đã có', async () => {
      ctx = buildService([
        makePeriod({
          id: 'p1',
          code: '2026-01',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        }),
      ]);

      await expect(
        ctx.service.create(
          {
            code: '2026-01b',
            name: 'Chồng lấn',
            startDate: '2026-01-15',
            endDate: '2026-02-15',
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resolveByDate', () => {
    it('trả về kỳ chứa ngày', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', startDate: '2026-01-01', endDate: '2026-01-31' }),
        makePeriod({ id: 'p2', code: '2026-02', startDate: '2026-02-01', endDate: '2026-02-28' }),
      ]);

      const period = await ctx.service.resolveByDate('2026-02-14');
      expect(period.id).toBe('p2');
    });

    it('báo lỗi khi ngày không thuộc kỳ nào', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', startDate: '2026-01-01', endDate: '2026-01-31' }),
      ]);

      await expect(ctx.service.resolveByDate('2026-05-01')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('assertAcceptsPostings', () => {
    it('cho qua kỳ đang mở', () => {
      expect(() =>
        ctx.service.assertAcceptsPostings(
          makePeriod({ status: FiscalPeriodStatus.OPEN }),
        ),
      ).not.toThrow();
    });

    it('chặn kỳ tạm khóa', () => {
      expect(() =>
        ctx.service.assertAcceptsPostings(
          makePeriod({ status: FiscalPeriodStatus.LOCKED }),
        ),
      ).toThrow(BadRequestException);
    });

    it('chặn kỳ đã chốt', () => {
      expect(() =>
        ctx.service.assertAcceptsPostings(
          makePeriod({ status: FiscalPeriodStatus.CLOSED }),
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('lock / open', () => {
    it('khóa được kỳ đang mở và ghi nhận người khóa', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', status: FiscalPeriodStatus.OPEN }),
      ]);

      const period = await ctx.service.lock('p1', 'user-9');
      expect(period.status).toBe(FiscalPeriodStatus.LOCKED);
      expect(period.lockedBy).toBe('user-9');
      expect(period.lockedAt).toBeInstanceOf(Date);
    });

    it('từ chối khóa kỳ đã khóa', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', status: FiscalPeriodStatus.LOCKED }),
      ]);

      await expect(ctx.service.lock('p1', 'user-9')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('mở lại được kỳ đã tạm khóa', async () => {
      ctx = buildService([
        makePeriod({
          id: 'p1',
          status: FiscalPeriodStatus.LOCKED,
          lockedAt: new Date(),
          lockedBy: 'user-9',
        }),
      ]);

      const period = await ctx.service.open('p1');
      expect(period.status).toBe(FiscalPeriodStatus.OPEN);
      expect(period.lockedBy).toBeNull();
    });

    it('KHÔNG mở lại được kỳ đã chốt', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', status: FiscalPeriodStatus.CLOSED }),
      ]);

      await expect(ctx.service.open('p1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('close', () => {
    it('chốt kỳ và chuyển số dư sang kỳ kế tiếp', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', code: '2026-01', startDate: '2026-01-01', endDate: '2026-01-31' }),
        makePeriod({ id: 'p2', code: '2026-02', startDate: '2026-02-01', endDate: '2026-02-28' }),
      ]);

      const period = await ctx.service.close('p1', 'user-9');

      expect(period.status).toBe(FiscalPeriodStatus.CLOSED);
      expect(period.closedBy).toBe('user-9');
      expect(ctx.ledger.carryForwardOpening).toHaveBeenCalledWith(
        expect.anything(),
        'p1',
        'p2',
      );
    });

    it('không chuyển số dư khi không có kỳ kế tiếp', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', startDate: '2026-01-01', endDate: '2026-01-31' }),
      ]);

      await ctx.service.close('p1', 'user-9');

      expect(ctx.ledger.carryForwardOpening).not.toHaveBeenCalled();
    });

    it('từ chối chốt kỳ đã chốt', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', status: FiscalPeriodStatus.CLOSED }),
      ]);

      await expect(ctx.service.close('p1', 'user-9')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('từ chối sửa kỳ đã khóa', async () => {
      ctx = buildService([
        makePeriod({ id: 'p1', status: FiscalPeriodStatus.LOCKED }),
      ]);

      await expect(
        ctx.service.update('p1', { name: 'Đổi tên' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sửa được tên kỳ đang mở', async () => {
      ctx = buildService([makePeriod({ id: 'p1', name: 'Tên cũ' })]);

      const period = await ctx.service.update('p1', { name: 'Tên mới' });
      expect(period.name).toBe('Tên mới');
    });
  });

  describe('remove', () => {
    it('từ chối xóa kỳ đã có bút toán', async () => {
      ctx = buildService([makePeriod({ id: 'p1' })]);
      ctx.entries.count.mockResolvedValue(3);

      await expect(ctx.service.remove('p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('xóa được kỳ đang mở chưa có bút toán', async () => {
      ctx = buildService([makePeriod({ id: 'p1' })]);

      await ctx.service.remove('p1');
      expect(ctx.periods._store).toHaveLength(0);
    });
  });
});
