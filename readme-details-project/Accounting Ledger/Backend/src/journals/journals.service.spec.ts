import { BadRequestException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JournalStatus } from '../common/enums/journal-status.enum.js';
import { JournalEntry } from './entities/journal-entry.entity.js';
import { JournalLine } from './entities/journal-line.entity.js';
import { JournalsService } from './journals.service.js';

// ---------------------------------------------------------------- helpers

const ACC_CASH = 'acc-cash';
const ACC_REVENUE = 'acc-revenue';

function makeEntry(partial: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-1',
    entryNo: null,
    date: '2026-01-15',
    periodId: 'period-1',
    description: 'Bút toán thử',
    reference: null,
    status: JournalStatus.DRAFT,
    totalDebit: '1000000.0000',
    totalCredit: '1000000.0000',
    idempotencyKey: null,
    createdBy: 'user-1',
    approvedBy: null,
    approvedAt: null,
    postedBy: null,
    postedAt: null,
    reversalOfEntryId: null,
    reversedByEntryId: null,
    lines: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as JournalEntry;
}

function makeLine(partial: Partial<JournalLine> = {}): JournalLine {
  return {
    id: 'line-1',
    entryId: 'entry-1',
    lineNo: 1,
    accountId: ACC_CASH,
    debit: '1000000.0000',
    credit: '0',
    description: null,
    ...partial,
  } as JournalLine;
}

/** Bộ dòng cân bằng: Nợ tiền mặt 1.000.000 / Có doanh thu 1.000.000. */
function balancedLines() {
  return [
    { accountId: ACC_CASH, debit: '1000000.0000' },
    { accountId: ACC_REVENUE, credit: '1000000.0000' },
  ];
}

function matches(
  entity: unknown,
  where: Record<string, unknown>,
): boolean {
  if (!entity || typeof entity !== 'object') return false;
  const obj = entity as Record<string, unknown>;
  return Object.entries(where).every(([key, condition]) => {
    const actual = obj[key];
    if (condition instanceof FindOperator) {
      throw new Error(`Mock chưa hỗ trợ FindOperator "${condition.type}"`);
    }
    return actual === condition;
  });
}

interface Store {
  entries: JournalEntry[];
  lines: JournalLine[];
}

function createStore(): Store {
  return { entries: [], lines: [] };
}

function seedEntry(
  store: Store,
  entryPartial: Partial<JournalEntry> = {},
  linePartials: Partial<JournalLine>[] = [
    { id: 'line-1', lineNo: 1, accountId: ACC_CASH, debit: '1000000.0000', credit: '0' },
    { id: 'line-2', lineNo: 2, accountId: ACC_REVENUE, debit: '0', credit: '1000000.0000' },
  ],
): JournalEntry {
  const entry = makeEntry(entryPartial);
  store.entries.push(entry);
  for (const partial of linePartials) {
    store.lines.push(makeLine({ entryId: entry.id, ...partial }));
  }
  return entry;
}

function persistEntry(store: Store, seq: { value: number }, entity: JournalEntry): JournalEntry {
  const saved = entity.id ? entity : { ...entity, id: `entry-${++seq.value}` };
  if (Array.isArray(saved.lines)) {
    saved.lines = saved.lines.map((line, index) => {
      const withId = line.id
        ? line
        : {
            ...line,
            id: `line-${++seq.value}`,
            entryId: saved.id,
            lineNo: line.lineNo ?? index + 1,
          };
      const at = store.lines.findIndex((l) => l.id === withId.id);
      if (at >= 0) store.lines[at] = withId;
      else store.lines.push(withId);
      return withId;
    });
  }
  const at = store.entries.findIndex((e) => e.id === saved.id);
  if (at >= 0) store.entries[at] = saved;
  else store.entries.push(saved);
  return saved;
}

function buildService(store: Store = createStore()) {
  const seq = { value: 100 };

  const manager = {
    findOne: vi.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
      if (entity === JournalEntry) {
        return store.entries.find((e) => matches(e, options.where)) ?? null;
      }
      return null;
    }),
    find: vi.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
      if (entity === JournalLine) {
        return store.lines
          .filter((l) => matches(l, options.where))
          .sort((a, b) => a.lineNo - b.lineNo);
      }
      return [];
    }),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    save: vi.fn(async (entity: unknown, value: JournalEntry) => {
      if (entity === JournalEntry) {
        return persistEntry(store, seq, value);
      }
      return value;
    }),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return [
          { count: store.entries.filter((e) => e.entryNo !== null).length },
        ];
      }
      return [];
    }),
  };

  const entries = {
    findOne: vi.fn(async (options: { where: Record<string, unknown>; relations?: unknown }) => {
      const found = store.entries.find((e) => matches(e, options.where));
      if (!found) return null;
      const result = { ...found };
      if (options.relations) {
        result.lines = store.lines
          .filter((l) => l.entryId === found.id)
          .sort((a, b) => a.lineNo - b.lineNo);
      }
      return result;
    }),
    create: vi.fn((data: Record<string, unknown>) => ({ ...data })),
    save: vi.fn(async (entity: JournalEntry) => persistEntry(store, seq, entity)),
    remove: vi.fn(async (entity: JournalEntry) => {
      const at = store.entries.findIndex((e) => e.id === entity.id);
      if (at >= 0) store.entries.splice(at, 1);
      return entity;
    }),
  };

  const lines = {
    create: vi.fn((data: Record<string, unknown>) => ({ ...data })),
    delete: vi.fn(async (criteria: { entryId: string }) => {
      store.lines = store.lines.filter((l) => l.entryId !== criteria.entryId);
      return { affected: 1 };
    }),
    find: vi.fn(async () => []),
  };

  const accounts = {
    getPostable: vi.fn(async (id: string) => ({ id, code: '1111', isPostable: true, isActive: true })),
  };

  const periods = {
    resolveByDate: vi.fn(async () => ({
      id: 'period-1',
      code: '2026-01',
      status: 'open',
    })),
    findById: vi.fn(async () => ({
      id: 'period-1',
      code: '2026-01',
      status: 'open',
    })),
    assertAcceptsPostings: vi.fn(),
  };

  const ledger = { applyMovements: vi.fn(async () => undefined) };

  const parties = {
    getActive: vi.fn(async (id: string) => ({ id, code: 'C001', name: 'Test', isActive: true })),
  };

  const dataSource = {
    transaction: vi.fn(async (run: (m: unknown) => Promise<unknown>) => run(manager)),
  };

  const service = new JournalsService(
    entries as never,
    lines as never,
    accounts as never,
    periods as never,
    ledger as never,
    parties as never,
    dataSource as never,
  );

  return { service, store, manager, entries, lines, accounts, periods, ledger, dataSource };
}

type Ctx = ReturnType<typeof buildService>;

// ------------------------------------------------------------------ tests

describe('JournalsService', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = buildService();
  });

  describe('create — bất biến cân bằng Nợ/Có', () => {
    it('từ chối bút toán không cân bằng', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Lệch',
            lines: [
              { accountId: ACC_CASH, debit: '1000000' },
              { accountId: ACC_REVENUE, credit: '900000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối dòng ghi cả Nợ lẫn Có', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Hai bên',
            lines: [
              { accountId: ACC_CASH, debit: '1000', credit: '1000' },
              { accountId: ACC_REVENUE, credit: '1000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối dòng không ghi Nợ cũng không ghi Có', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Dòng rỗng',
            lines: [
              { accountId: ACC_CASH },
              { accountId: ACC_REVENUE, credit: '1000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối khi chưa đủ 2 dòng', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Một dòng',
            lines: [{ accountId: ACC_CASH, debit: '1000' }],
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối số tiền âm', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Số âm',
            lines: [
              { accountId: ACC_CASH, debit: '-1000' },
              { accountId: ACC_REVENUE, credit: '-1000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create — ràng buộc tài khoản & kỳ', () => {
    it('từ chối ghi vào tài khoản tổng hợp / ngừng dùng', async () => {
      ctx.accounts.getPostable.mockRejectedValue(
        new BadRequestException('Tài khoản tổng hợp'),
      );

      await expect(
        ctx.service.create(
          { date: '2026-01-15', description: 'TK tổng hợp', lines: balancedLines() },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối khi kỳ kế toán đã chốt', async () => {
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đã chốt');
      });

      await expect(
        ctx.service.create(
          { date: '2026-01-15', description: 'Kỳ chốt', lines: balancedLines() },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối lập nháp vào kỳ đã tạm khóa (đóng băng cả bản nháp)', async () => {
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đang tạm khóa');
      });

      await expect(
        ctx.service.create(
          { date: '2026-01-15', description: 'Kỳ khóa', lines: balancedLines() },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tạo được bút toán nháp với tổng Nợ/Có đã chuẩn hóa', async () => {
      const entry = await ctx.service.create(
        { date: '2026-01-15', description: 'Bán hàng', lines: balancedLines() },
        'user-1',
      );

      expect(entry.status).toBe(JournalStatus.DRAFT);
      expect(entry.totalDebit).toBe('1000000.0000');
      expect(entry.totalCredit).toBe('1000000.0000');
      expect(entry.entryNo).toBeNull();
      expect(entry.createdBy).toBe('user-1');
    });
  });

  describe('create — idempotency', () => {
    it('gửi lại cùng idempotencyKey trả về bút toán cũ, không tạo bản sao', async () => {
      const first = await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Bán hàng',
          idempotencyKey: 'req-abc',
          lines: balancedLines(),
        },
        'user-1',
      );

      const second = await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Bán hàng (retry)',
          idempotencyKey: 'req-abc',
          lines: balancedLines(),
        },
        'user-1',
      );

      expect(second.id).toBe(first.id);
      expect(ctx.store.entries).toHaveLength(1);
    });
  });

  describe('update / remove — chỉ với bút toán nháp', () => {
    it('sửa được diễn giải bút toán nháp', async () => {
      seedEntry(ctx.store, { id: 'e1', description: 'Cũ' });

      const entry = await ctx.service.update('e1', { description: 'Mới' });
      expect(entry.description).toBe('Mới');
    });

    it('từ chối sửa bút toán đã ghi sổ', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.POSTED });

      await expect(
        ctx.service.update('e1', { description: 'Đổi trộm' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối xóa bút toán đã ghi sổ', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.POSTED });

      await expect(ctx.service.remove('e1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('xóa được bút toán nháp', async () => {
      seedEntry(ctx.store, { id: 'e1' });

      await ctx.service.remove('e1');
      expect(ctx.store.entries).toHaveLength(0);
    });

    it('từ chối sửa bút toán nháp nằm trong kỳ đã khóa', async () => {
      seedEntry(ctx.store, { id: 'e1' });
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đang tạm khóa');
      });

      await expect(
        ctx.service.update('e1', { description: 'Đổi trộm' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối xóa bút toán nháp nằm trong kỳ đã khóa', async () => {
      seedEntry(ctx.store, { id: 'e1' });
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đang tạm khóa');
      });

      await expect(ctx.service.remove('e1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.store.entries).toHaveLength(1);
    });
  });

  describe('approve', () => {
    it('chuyển nháp → đã xác nhận', async () => {
      seedEntry(ctx.store, { id: 'e1' });

      const entry = await ctx.service.approve('e1', 'checker-1');

      expect(entry.status).toBe(JournalStatus.APPROVED);
      expect(entry.approvedBy).toBe('checker-1');
      expect(entry.approvedAt).toBeInstanceOf(Date);
    });

    it('từ chối xác nhận bút toán không ở trạng thái nháp', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.POSTED });

      await expect(ctx.service.approve('e1', 'checker-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('post', () => {
    it('từ chối ghi sổ bút toán chưa được xác nhận', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.DRAFT });

      await expect(ctx.service.post('e1', 'poster-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('từ chối ghi sổ khi kỳ kế toán không mở', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.APPROVED });
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đang tạm khóa');
      });

      await expect(ctx.service.post('e1', 'poster-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.ledger.applyMovements).not.toHaveBeenCalled();
    });

    it('ghi sổ: cấp số hiệu, đổi trạng thái và cập nhật số dư trong 1 transaction', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.APPROVED });

      const entry = await ctx.service.post('e1', 'poster-1');

      expect(entry.status).toBe(JournalStatus.POSTED);
      expect(entry.entryNo).toBe('JE-2026-01-0001');
      expect(entry.postedBy).toBe('poster-1');
      expect(ctx.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(ctx.ledger.applyMovements).toHaveBeenCalledWith(
        ctx.manager,
        'period-1',
        [
          { accountId: ACC_CASH, debit: '1000000.0000', credit: '0' },
          { accountId: ACC_REVENUE, debit: '0', credit: '1000000.0000' },
        ],
      );
    });

    it('gọi lại không sinh phát sinh thêm (idempotent)', async () => {
      seedEntry(ctx.store, {
        id: 'e1',
        status: JournalStatus.POSTED,
        entryNo: 'JE-2026-01-0001',
      });

      const entry = await ctx.service.post('e1', 'poster-1');

      expect(entry.status).toBe(JournalStatus.POSTED);
      expect(ctx.ledger.applyMovements).not.toHaveBeenCalled();
    });
  });

  describe('reverse', () => {
    it('từ chối đảo bút toán chưa ghi sổ', async () => {
      seedEntry(ctx.store, { id: 'e1', status: JournalStatus.APPROVED });

      await expect(
        ctx.service.reverse('e1', { reason: 'Sai tài khoản' }, 'poster-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tạo bút toán đảo hoán đổi Nợ/Có, đánh dấu bản gốc đã đảo và triệt tiêu số dư', async () => {
      const original = seedEntry(ctx.store, {
        id: 'e1',
        status: JournalStatus.POSTED,
        entryNo: 'JE-2026-01-0001',
      });

      const reversal = await ctx.service.reverse(
        'e1',
        { reason: 'Ghi nhận sai tài khoản' },
        'poster-1',
      );

      // Bút toán đảo: Nợ ↔ Có hoán đổi (số tiền được chuẩn hóa 4 chữ số thập phân).
      expect(reversal.status).toBe(JournalStatus.POSTED);
      expect(reversal.reversalOfEntryId).toBe('e1');
      expect(reversal.entryNo).toBe('JE-2026-01-0002');
      expect(reversal.lines).toHaveLength(2);
      expect(reversal.lines[0]).toMatchObject({
        accountId: ACC_CASH,
        debit: '0.0000',
        credit: '1000000.0000',
      });
      expect(reversal.lines[1]).toMatchObject({
        accountId: ACC_REVENUE,
        debit: '1000000.0000',
        credit: '0.0000',
      });

      // Bản gốc KHÔNG bị sửa/xóa, chỉ đổi trạng thái và giữ nguyên số hiệu.
      const stored = ctx.store.entries.find((e) => e.id === 'e1');
      expect(original.entryNo).toBe('JE-2026-01-0001');
      expect(stored?.status).toBe(JournalStatus.REVERSED);
      expect(stored?.reversedByEntryId).toBe(reversal.id);

      // Số dư được cập nhật theo dòng đã hoán đổi.
      expect(ctx.ledger.applyMovements).toHaveBeenCalledWith(
        ctx.manager,
        'period-1',
        [
          { accountId: ACC_CASH, debit: '0.0000', credit: '1000000.0000' },
          { accountId: ACC_REVENUE, debit: '1000000.0000', credit: '0.0000' },
        ],
      );
    });

    it('từ chối đảo khi kỳ kế toán không mở', async () => {
      seedEntry(ctx.store, {
        id: 'e1',
        status: JournalStatus.POSTED,
        entryNo: 'JE-2026-01-0001',
      });
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đã chốt');
      });

      await expect(
        ctx.service.reverse('e1', { reason: 'Sai' }, 'poster-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.ledger.applyMovements).not.toHaveBeenCalled();
    });
  });
});
