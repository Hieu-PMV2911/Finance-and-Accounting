import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReconciliationExceptionType } from '../payment-intents/enums/reconciliation-exception.enum.js';
import { BankStatementStatus } from './enums/bank-statement-status.enum.js';
import {
  BankTransactionDirection,
  BankTransactionSource,
  ReconciliationMatchStatus,
  ReconciliationMatchTargetType,
  ReconciliationMatchTier,
} from './enums/bank-transaction.enum.js';
import { BankStatement } from './entities/bank-statement.entity.js';
import { BankTransaction } from './entities/bank-transaction.entity.js';
import { ReconciliationService } from './reconciliation.service.js';

const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATEMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TXN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function statement(overrides: Partial<BankStatement> = {}): BankStatement {
  return {
    id: STATEMENT_ID,
    code: 'ST-TEST-1',
    accountId: ACCOUNT_ID,
    statementDate: '2026-10-31',
    openingBalance: '25000000.0000',
    closingBalance: '26475000.0000',
    status: BankStatementStatus.IMPORTED,
    sourceRef: null,
    transactions: [],
    createdBy: 'user-poster',
    createdAt: new Date('2026-10-31T00:00:00Z'),
    updatedAt: new Date('2026-10-31T00:00:00Z'),
    ...overrides,
  } as BankStatement;
}

function transaction(
  overrides: Partial<BankTransaction> = {},
): BankTransaction {
  return {
    id: TXN_ID,
    statementId: STATEMENT_ID,
    accountId: ACCOUNT_ID,
    transactionDate: '2026-10-12',
    valueDate: null,
    description: 'Chuyen tien DH-2026-0912',
    reference: null,
    bankRef: 'BR-001',
    direction: BankTransactionDirection.IN,
    amount: '1500000.0000',
    currency: 'VND',
    source: BankTransactionSource.FILE,
    sourceRef: null,
    raw: null,
    matchStatus: ReconciliationMatchStatus.UNMATCHED,
    match: null,
    createdAt: new Date('2026-10-31T00:00:00Z'),
    updatedAt: new Date('2026-10-31T00:00:00Z'),
    ...overrides,
  } as BankTransaction;
}

function build(seedTransactions: BankTransaction[] = []) {
  const store = new Map<string, BankTransaction>(
    seedTransactions.map((t) => [t.id, t]),
  );
  let statementRow = statement();

  const statements = {
    findOne: vi.fn(async () => statementRow),
    find: vi.fn(async () => [statementRow]),
    count: vi.fn(async () => 0),
    exists: vi.fn(async () => false),
    create: vi.fn((e: Partial<BankStatement>) => ({ ...e })),
    save: vi.fn(async (e: BankStatement) => {
      statementRow = { ...statementRow, ...e };
      return statementRow;
    }),
  };

  const transactions = {
    findOne: vi.fn(async (opts: { where: Record<string, unknown> }) => {
      const id = opts.where.id as string | undefined;
      if (id) return store.get(id) ?? null;
      // findDuplicate theo khóa nghiệp vụ.
      const { accountId, transactionDate, amount, bankRef } = opts.where;
      for (const t of store.values()) {
        if (
          t.accountId === accountId &&
          t.transactionDate === transactionDate &&
          t.amount === amount &&
          (bankRef === undefined || t.bankRef === bankRef)
        ) {
          return t;
        }
      }
      return null;
    }),
    find: vi.fn(async (opts?: { where?: Record<string, unknown> }) => {
      if (!opts?.where?.statementId) return [...store.values()];
      return [...store.values()].filter(
        (t) => t.statementId === opts.where?.statementId,
      );
    }),
    count: vi.fn(async () => 0),
    create: vi.fn((e: Partial<BankTransaction>) => ({
      ...e,
      id: e.id ?? TXN_ID,
    })),
    save: vi.fn(async (e: BankTransaction) => {
      store.set(e.id, { ...e });
      return e;
    }),
  };

  const matches = {
    findOne: vi.fn(async () => null),
    find: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn((e: Record<string, unknown>) => ({ id: 'match-1', ...e })),
    save: vi.fn(async (e: Record<string, unknown>) => e),
    delete: vi.fn(async () => ({ affected: 1 })),
  };

  const exceptions = {
    create: vi.fn(async (input: Record<string, unknown>) => ({
      id: 'exc-1',
      ...input,
    })),
  };

  const accounts = {
    getPostable: vi.fn(async () => ({ id: ACCOUNT_ID })),
    requirePostableByCodePrefix: vi.fn(async (prefix: string) => ({
      id: `acc-${prefix}`,
    })),
  };

  const periods = {
    resolveByDate: vi.fn(async () => ({ id: 'period-1', status: 'open' })),
    assertAcceptsPostings: vi.fn(),
  };

  const journals = {
    postDocument: vi.fn(
      async (
        _dto: unknown,
        _actor: string,
        commit: (m: unknown, entry: unknown) => Promise<void>,
      ) => {
        const entry = { id: 'entry-1' };
        await commit({}, entry);
        return entry;
      },
    ),
    findById: vi.fn(async () => ({ id: 'entry-1' })),
  };

  const payments = {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => ({ id: 'payment-1', code: 'PT-2026-0001' })),
  };

  const registry = {
    register: vi.fn(),
  };

  const fileAdapter = {
    name: 'csv-json',
    parse: vi.fn(() => []),
  };
  const apiAdapter = {
    name: 'bank-api',
    parse: vi.fn(() => {
      throw new Error('chưa cấu hình');
    }),
  };

  const service = new ReconciliationService(
    statements as never,
    transactions as never,
    matches as never,
    accounts as never,
    periods as never,
    journals as never,
    payments as never,
    exceptions as never,
    registry as never,
    fileAdapter as never,
    apiAdapter as never,
  );

  return {
    service,
    store,
    statements,
    transactions,
    matches,
    exceptions,
    accounts,
    periods,
    journals,
    payments,
    registry,
    fileAdapter,
    apiAdapter,
    getStatement: () => statementRow,
  };
}

describe('ReconciliationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('importStatement', () => {
    it('chọn adapter theo nguồn và chỉ nạp dòng mới (chống trùng)', async () => {
      // Dòng seed đã tồn tại — nạp lại cùng file phải bỏ qua (không tạo bản 2).
      const ctx = build([transaction()]);
      ctx.fileAdapter.parse.mockReturnValue([
        {
          transactionDate: '2026-10-12',
          valueDate: null,
          description: 'Chuyen tien DH-2026-0912',
          reference: null,
          bankRef: 'BR-001',
          direction: BankTransactionDirection.IN,
          amount: '1500000.0000',
          currency: 'VND',
          raw: {},
        },
      ] as never);

      const result = await ctx.service.importStatement(
        {
          accountId: ACCOUNT_ID,
          content: 'ignored',
          sourceRef: 'file-1',
        },
        'user-poster',
      );

      expect(ctx.fileAdapter.parse).toHaveBeenCalled();
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('nạp qua adapter API thì từ chối (khung rỗng) — không đoán bừa', async () => {
      const ctx = build();
      await expect(
        ctx.service.importStatement(
          {
            accountId: ACCOUNT_ID,
            content: 'x',
            source: BankTransactionSource.API,
          },
          'user-poster',
        ),
      ).rejects.toThrow(/chưa cấu hình|API/);
    });
  });

  describe('reconcileStatement', () => {
    it('dòng không khớp tầng nào ⇒ ghi ngoại lệ missing_internal', async () => {
      const ctx = build([transaction()]);
      // payments.list trả rỗng ⇒ không có ứng viên ⇒ không tầng nào khớp.
      const result = await ctx.service.reconcileStatement(STATEMENT_ID);

      expect(result.unmatched).toBe(1);
      expect(ctx.exceptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ReconciliationExceptionType.MISSING_INTERNAL,
          externalRef: TXN_ID,
        }),
      );
    });

    it('từ chối chạy lại khi sao kê đã chốt (bất biến)', async () => {
      const ctx = build();
      ctx.statements.findOne.mockResolvedValue(
        statement({ status: BankStatementStatus.RECONCILED }),
      );

      await expect(
        ctx.service.reconcileStatement(STATEMENT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resolveStatement (chốt — bất biến)', () => {
    it('chặn chốt khi còn dòng unmatched/suggested', async () => {
      const ctx = build([transaction()]);
      // transactions.count trả > 0 ⇒ còn dòng chưa khớp.
      ctx.transactions.count.mockResolvedValue(3);

      await expect(
        ctx.service.resolveStatement(STATEMENT_ID, 'user-poster'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('chốt được khi mọi dòng đã khớp và số dư cân', async () => {
      const ctx = build([
        transaction({ matchStatus: ReconciliationMatchStatus.MATCHED }),
      ]);
      ctx.transactions.count.mockResolvedValue(0);
      // Σ vào − Σ ra + đầu = 25 000 000 + 1 500 000 = 26 500 000 ≠ closing.
      // Đặt closing đúng để passed.
      ctx.statements.findOne.mockResolvedValue(
        statement({ closingBalance: '26500000.0000' }),
      );

      const result = await ctx.service.resolveStatement(
        STATEMENT_ID,
        'user-poster',
      );
      expect(result.status).toBe(BankStatementStatus.RECONCILED);
    });

    it('chặn chốt khi số dư đầu/cuối lệch phát sinh (sao kê thiếu dòng)', async () => {
      const ctx = build([
        transaction({ matchStatus: ReconciliationMatchStatus.MATCHED }),
      ]);
      ctx.transactions.count.mockResolvedValue(0);
      ctx.statements.findOne.mockResolvedValue(
        statement({ closingBalance: '99999999.0000' }),
      );

      await expect(
        ctx.service.resolveStatement(STATEMENT_ID, 'user-poster'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('confirmMatch', () => {
    it('bắt buộc ghi chú khi số tiền khớp khác số tiền dòng sao', async () => {
      const ctx = build([transaction()]);

      await expect(
        ctx.service.confirmMatch(
          TXN_ID,
          {
            targetType: ReconciliationMatchTargetType.PAYMENT,
            targetId: 'payment-1',
            amount: '1400000.0000',
            // thiếu note
          },
          'user-poster',
        ),
      ).rejects.toThrow(/ghi chú/);
    });

    it('chặn số tiền khớp lớn hơn số tiền dòng sao', async () => {
      const ctx = build([transaction()]);

      await expect(
        ctx.service.confirmMatch(
          TXN_ID,
          {
            targetType: ReconciliationMatchTargetType.PAYMENT,
            targetId: 'payment-1',
            amount: '2000000.0000',
            note: 'lệch',
          },
          'user-poster',
        ),
      ).rejects.toThrow(/lớn hơn/);
    });

    it('ghép tay hợp lệ ⇒ tạo dòng khớp manual và đánh dấu matched', async () => {
      const ctx = build([transaction()]);

      const match = await ctx.service.confirmMatch(
        TXN_ID,
        {
          targetType: ReconciliationMatchTargetType.PAYMENT,
          targetId: 'payment-1',
        },
        'user-poster',
      );

      expect(match.matchedByTier).toBe(ReconciliationMatchTier.MANUAL);
      expect(match.matchedBy).toBe('user-poster');
      expect(ctx.store.get(TXN_ID)?.matchStatus).toBe(
        ReconciliationMatchStatus.MATCHED,
      );
    });
  });

  describe('createBankAdjustment', () => {
    it('dòng tiền ra ⇒ Nợ chi phí · Có tiền, và cập nhật trạng thái trong cùng tx', async () => {
      const ctx = build([
        transaction({
          direction: BankTransactionDirection.OUT,
          amount: '25000.0000',
          description: 'Phi chuyen khoan',
          matchStatus: ReconciliationMatchStatus.UNMATCHED,
        }),
      ]);

      await ctx.service.createBankAdjustment(
        TXN_ID,
        {},
        'user-poster',
      );

      expect(ctx.journals.postDocument).toHaveBeenCalledTimes(1);
      const [dto] = ctx.journals.postDocument.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(dto.sourceType).toBe('bank_transaction');
      expect(dto.sourceId).toBe(TXN_ID);
      const lines = dto.lines as Array<Record<string, unknown>>;
      // Tiền ra ⇒ Nợ 642 (chi phí) · Có tiền.
      expect(lines[0]).toMatchObject({ debit: '25000.0000' });
      expect(lines[1]).toMatchObject({ credit: '25000.0000' });
      // commit của postDocument cập nhật trạng thái dòng sao.
      expect(ctx.store.get(TXN_ID)?.matchStatus).toBe(
        ReconciliationMatchStatus.MATCHED,
      );
    });
  });
});
