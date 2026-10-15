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

  // Mục 10.C.1 — mặc định coi mọi bút toán trong bộ test này là nội tệ (`VND`),
  // nên `requireRate` không bao giờ được gọi. Test riêng cho ngoại tệ sẽ tự thay
  // stub này bằng tỷ giá cụ thể.
  const exchangeRates = {
    baseCurrency: vi.fn(async () => 'VND'),
    requireRate: vi.fn(async () => ({
      currency: 'USD',
      baseCurrency: 'VND',
      rate: '24500.00000000',
      rateDate: '2026-01-01',
      fallback: false,
      source: 'manual',
    })),
  };

  const service = new JournalsService(
    entries as never,
    lines as never,
    accounts as never,
    periods as never,
    ledger as never,
    parties as never,
    exchangeRates as never,
    dataSource as never,
  );

  return {
    service,
    store,
    manager,
    entries,
    lines,
    accounts,
    periods,
    ledger,
    exchangeRates,
    dataSource,
  };
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

  /**
   * Mục 10.C.1 — dòng ngoại tệ.
   *
   * Bất biến trung tâm cần chứng minh: `debit`/`credit` **luôn** là tiền hạch toán và
   * do người gọi cung cấp; cột ngoại tệ chỉ là *bằng chứng* nên service **kiểm tra
   * ngược** chứ không tự ghi đè. Nếu service tự nhân hộ, một `fxRate` gõ sai sẽ tạo ra
   * số tiền sai mà Σ Nợ = Σ Có vẫn "đúng" — không lá chắn nào phát hiện.
   */
  describe('mục 10.C.1 — dòng ngoại tệ', () => {
    /** 1.000 USD × 24.500 = 24.500.000 VND. */
    const fxLine = (overrides: Record<string, unknown> = {}) => ({
      accountId: ACC_CASH,
      debit: '24500000.0000',
      currency: 'USD',
      fxAmount: '1000.0000',
      fxRate: '24500',
      ...overrides,
    });

    it('nhận dòng ngoại tệ hợp lệ và lưu đủ ba cột ngoại tệ', async () => {
      const entry = await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Thu ngoại tệ',
          lines: [
            fxLine(),
            { accountId: ACC_REVENUE, credit: '24500000.0000' },
          ],
        },
        'user-1',
      );

      const stored = ctx.store.lines.filter((l) => l.entryId === entry.id);
      const cash = stored.find((l) => l.accountId === ACC_CASH);

      expect(cash?.currency).toBe('USD');
      expect(cash?.fxAmount).toBe('1000.0000');
      expect(cash?.fxRate).toBe('24500.00000000');
      // `debit` vẫn là tiền hạch toán, không bị đổi thành số ngoại tệ.
      expect(cash?.debit).toBe('24500000.0000');
    });

    it('dòng nội tệ để cả ba cột ngoại tệ là null', async () => {
      const entry = await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Nội tệ',
          lines: balancedLines(),
        },
        'user-1',
      );

      const stored = ctx.store.lines.filter((l) => l.entryId === entry.id);
      expect(stored.every((l) => l.currency === null)).toBe(true);
      expect(stored.every((l) => l.fxAmount === null)).toBe(true);
      expect(stored.every((l) => l.fxRate === null)).toBe(true);
    });

    it('CHẶN khi tiền hạch toán không khớp fxAmount × fxRate (không tự sửa)', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Quy đổi sai',
            lines: [
              // 1.000 × 24.500 = 24.500.000, nhưng khai 24.000.000.
              fxLine({ debit: '24000000.0000' }),
              { accountId: ACC_REVENUE, credit: '24000000.0000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/không khớp quy đổi/);
    });

    it('thông báo lỗi nêu cả số đã khai, tỷ giá và số đúng để sửa một lần', async () => {
      const error = await ctx.service
        .create(
          {
            date: '2026-01-15',
            description: 'Quy đổi sai',
            lines: [
              fxLine({ debit: '24000000.0000' }),
              { accountId: ACC_REVENUE, credit: '24000000.0000' },
            ],
          },
          'user-1',
        )
        .catch((e: Error) => e);

      expect((error as Error).message).toContain('24000000.0000');
      expect((error as Error).message).toContain('24500');
      expect((error as Error).message).toContain('24500000.0000');
    });

    it('bỏ trống fxRate ⇒ tra bảng tỷ giá theo ngày hạch toán', async () => {
      ctx.exchangeRates.requireRate.mockResolvedValue({
        currency: 'USD',
        baseCurrency: 'VND',
        rate: '24500.00000000',
        rateDate: '2026-01-15',
        fallback: false,
        source: 'manual',
      });

      const entry = await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Tra tỷ giá',
          lines: [
            fxLine({ fxRate: undefined }),
            { accountId: ACC_REVENUE, credit: '24500000.0000' },
          ],
        },
        'user-1',
      );

      expect(ctx.exchangeRates.requireRate).toHaveBeenCalledWith('USD', '2026-01-15');
      const cash = ctx.store.lines.find(
        (l) => l.entryId === entry.id && l.accountId === ACC_CASH,
      );
      expect(cash?.fxRate).toBe('24500.00000000');
    });

    it('có fxRate ⇒ KHÔNG gọi tra bảng tỷ giá (không phụ thuộc dữ liệu ngoài)', async () => {
      await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Tỷ giá chỉ định',
          lines: [
            fxLine(),
            { accountId: ACC_REVENUE, credit: '24500000.0000' },
          ],
        },
        'user-1',
      );

      expect(ctx.exchangeRates.requireRate).not.toHaveBeenCalled();
    });

    it('CHẶN dòng ngoại tệ thiếu fxAmount', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Thiếu fxAmount',
            lines: [
              fxLine({ fxAmount: undefined }),
              { accountId: ACC_REVENUE, credit: '24500000.0000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/phải khai fxAmount/);
    });

    it('CHẶN khi khai fxAmount/fxRate mà thiếu currency', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Thiếu currency',
            lines: [
              fxLine({ currency: undefined }),
              { accountId: ACC_REVENUE, credit: '24500000.0000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/thiếu currency/);
    });

    it('CHẶN khi khai ngoại tệ cho chính đơn vị tiền hạch toán', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'VND kèm fx',
            lines: [
              fxLine({ currency: 'VND' }),
              { accountId: ACC_REVENUE, credit: '24500000.0000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/đơn vị tiền hạch toán/);
    });

    it('CHẶN fxRate <= 0', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Tỷ giá 0',
            lines: [
              fxLine({ fxRate: '0', debit: '0.0001' }),
              { accountId: ACC_REVENUE, credit: '0.0001' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/fxRate phải lớn hơn 0/);
    });

    it('bất biến Σ Nợ = Σ Có vẫn áp dụng trên TIỀN HẠCH TOÁN', async () => {
      await expect(
        ctx.service.create(
          {
            date: '2026-01-15',
            description: 'Ngoại tệ nhưng lệch',
            lines: [
              fxLine(),
              { accountId: ACC_REVENUE, credit: '24500000.0000' },
              // Dòng nội tệ thêm vào làm lệch ⇒ phải bị chặn bởi luật cân bằng.
              { accountId: ACC_CASH, debit: '1.0000' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/không cân bằng/);
    });

    it('bút toán đảo sao lại nguyên cột ngoại tệ (không hoán đổi ngoại tệ)', async () => {
      const entry = await ctx.service.create(
        {
          date: '2026-01-15',
          description: 'Thu ngoại tệ',
          lines: [
            fxLine(),
            { accountId: ACC_REVENUE, credit: '24500000.0000' },
          ],
        },
        'user-1',
      );

      ctx.store.entries.find((e) => e.id === entry.id)!.status =
        JournalStatus.POSTED;
      ctx.store.entries.find((e) => e.id === entry.id)!.entryNo =
        'JE-2026-01-0001';

      const reversal = await ctx.service.reverse(
        entry.id,
        { reason: 'Sai sót' },
        'poster-1',
      );

      const reversedCash = ctx.store.lines.find(
        (l) => l.entryId === reversal.id && l.accountId === ACC_CASH,
      );
      // Nợ/Có hoán đổi…
      expect(reversedCash?.debit).toBe('0.0000');
      expect(reversedCash?.credit).toBe('24500000.0000');
      // …nhưng ngoại tệ giữ nguyên, vì nó là số tiền của giao dịch gốc.
      expect(reversedCash?.currency).toBe('USD');
      expect(reversedCash?.fxAmount).toBe('1000.0000');
      expect(reversedCash?.fxRate).toBe('24500.00000000');
    });
  });
});
