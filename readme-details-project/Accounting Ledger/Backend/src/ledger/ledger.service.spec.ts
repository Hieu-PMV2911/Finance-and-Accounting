import { describe, expect, it, vi } from 'vitest';

import { AccountType } from '../common/enums/account-type.enum.js';
import { AccountBalance } from './entities/account-balance.entity.js';
import { LedgerService } from './ledger.service.js';

// ---------------------------------------------------------------- helpers

function makeBalance(partial: Partial<AccountBalance> = {}): AccountBalance {
  return {
    id: 'b',
    accountId: 'acc',
    periodId: 'p1',
    openingDebit: '0',
    openingCredit: '0',
    debitTotal: '0',
    creditTotal: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as AccountBalance;
}

function createManagerMock(balances: AccountBalance[]) {
  let seq = 0;

  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO account_balances')) {
        const [accountId, periodId] = params as [string, string];
        const exists = balances.some(
          (b) => b.accountId === accountId && b.periodId === periodId,
        );
        if (!exists) {
          balances.push(
            makeBalance({ id: `b-${++seq}`, accountId, periodId }),
          );
        }
      }
      return [];
    }),
    findOne: vi.fn(
      async (_entity: unknown, options: { where: Record<string, string> }) =>
        balances.find(
          (b) =>
            b.accountId === options.where.accountId &&
            b.periodId === options.where.periodId,
        ) ?? null,
    ),
    find: vi.fn(
      async (_entity: unknown, options: { where: { periodId: string } }) =>
        balances.filter((b) => b.periodId === options.where.periodId),
    ),
    save: vi.fn(async (_entity: unknown, value: AccountBalance) => {
      const at = balances.findIndex((b) => b.id === value.id);
      if (at >= 0) balances[at] = value;
      else balances.push(value);
      return value;
    }),
  };
}

function buildService(balances: AccountBalance[] = []) {
  const manager = createManagerMock(balances);
  const repo = {
    find: vi.fn(async (options: { where: { periodId: string } }) =>
      balances.filter((b) => b.periodId === options.where.periodId),
    ),
  };
  const service = new LedgerService(repo as never);
  return { service, manager, repo, balances };
}

// ------------------------------------------------------------------ tests

describe('LedgerService', () => {
  describe('applyMovements', () => {
    it('cộng phát sinh Nợ/Có vào số dư của kỳ', async () => {
      const ctx = buildService();

      await ctx.service.applyMovements(ctx.manager as never, 'p1', [
        { accountId: 'acc-cash', debit: '1000000.0000', credit: '0' },
        { accountId: 'acc-revenue', debit: '0', credit: '1000000.0000' },
      ]);

      const cash = ctx.balances.find((b) => b.accountId === 'acc-cash');
      const revenue = ctx.balances.find((b) => b.accountId === 'acc-revenue');

      expect(cash?.debitTotal).toBe('1000000.0000');
      expect(cash?.creditTotal).toBe('0.0000');
      expect(revenue?.creditTotal).toBe('1000000.0000');
    });

    it('gộp nhiều dòng cùng một tài khoản trước khi cập nhật', async () => {
      const ctx = buildService();

      await ctx.service.applyMovements(ctx.manager as never, 'p1', [
        { accountId: 'acc-cash', debit: '100.0000', credit: '0' },
        { accountId: 'acc-cash', debit: '200.0000', credit: '0' },
        { accountId: 'acc-cash', debit: '0', credit: '50.0000' },
      ]);

      // Mỗi tài khoản chỉ bị khóa/ghi đúng một lần.
      expect(ctx.manager.save).toHaveBeenCalledTimes(1);

      const cash = ctx.balances.find((b) => b.accountId === 'acc-cash');
      expect(cash?.debitTotal).toBe('300.0000');
      expect(cash?.creditTotal).toBe('50.0000');
    });

    it('cộng dồn vào số dư đã có (không ghi đè)', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-cash',
          periodId: 'p1',
          debitTotal: '500.0000',
        }),
      ]);

      await ctx.service.applyMovements(ctx.manager as never, 'p1', [
        { accountId: 'acc-cash', debit: '250.0000', credit: '0' },
      ]);

      const cash = ctx.balances.find((b) => b.accountId === 'acc-cash');
      expect(cash?.debitTotal).toBe('750.0000');
    });

    it('sign = -1 thì trừ ra khỏi số dư', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-cash',
          periodId: 'p1',
          debitTotal: '1000.0000',
        }),
      ]);

      await ctx.service.applyMovements(
        ctx.manager as never,
        'p1',
        [{ accountId: 'acc-cash', debit: '400.0000', credit: '0' }],
        -1,
      );

      const cash = ctx.balances.find((b) => b.accountId === 'acc-cash');
      expect(cash?.debitTotal).toBe('600.0000');
    });

    it('không sai số khi cộng nhiều số thập phân (0.1 + 0.2)', async () => {
      const ctx = buildService();

      await ctx.service.applyMovements(ctx.manager as never, 'p1', [
        { accountId: 'acc-cash', debit: '0.1000', credit: '0' },
        { accountId: 'acc-cash', debit: '0.2000', credit: '0' },
      ]);

      const cash = ctx.balances.find((b) => b.accountId === 'acc-cash');
      // Với float sẽ ra 0.30000000000000004.
      expect(cash?.debitTotal).toBe('0.3000');
    });
  });

  describe('carryForwardOpening', () => {
    it('chuyển số dư cuối kỳ thành số dư đầu kỳ sau', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-cash',
          periodId: 'p1',
          openingDebit: '1000.0000',
          debitTotal: '500.0000',
        }),
      ]);

      const carried = await ctx.service.carryForwardOpening(
        ctx.manager as never,
        'p1',
        'p2',
      );

      expect(carried).toBe(1);
      const next = ctx.balances.find(
        (b) => b.accountId === 'acc-cash' && b.periodId === 'p2',
      );
      expect(next?.openingDebit).toBe('1500.0000');
      expect(next?.openingCredit).toBe('0.0000');
      // Phát sinh của kỳ mới bắt đầu từ 0.
      expect(next?.debitTotal).toBe('0');
    });

    it('bỏ qua tài khoản không còn số dư', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-empty',
          periodId: 'p1',
          openingDebit: '0',
          debitTotal: '0',
        }),
      ]);

      const carried = await ctx.service.carryForwardOpening(
        ctx.manager as never,
        'p1',
        'p2',
      );

      expect(carried).toBe(0);
      expect(ctx.balances.filter((b) => b.periodId === 'p2')).toHaveLength(0);
    });

    it('ghi đè nên gọi lại nhiều lần vẫn cho cùng kết quả', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-cash',
          periodId: 'p1',
          openingDebit: '1000.0000',
          debitTotal: '500.0000',
        }),
      ]);

      await ctx.service.carryForwardOpening(ctx.manager as never, 'p1', 'p2');
      await ctx.service.carryForwardOpening(ctx.manager as never, 'p1', 'p2');

      const next = ctx.balances.filter(
        (b) => b.accountId === 'acc-cash' && b.periodId === 'p2',
      );
      expect(next).toHaveLength(1);
      expect(next[0].openingDebit).toBe('1500.0000');
    });

    it('triệt tiêu Nợ và Có của cùng tài khoản khi kết chuyển', async () => {
      // Tài khoản doanh thu: phát sinh Có 5.000.000 rồi bị đảo (phát sinh Nợ
      // 5.000.000). Số dư thực tế bằng 0 nên KHÔNG được chuyển sang kỳ sau.
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-revenue',
          periodId: 'p1',
          debitTotal: '5000000.0000',
          creditTotal: '5000000.0000',
        }),
      ]);

      const carried = await ctx.service.carryForwardOpening(
        ctx.manager as never,
        'p1',
        'p2',
      );

      expect(carried).toBe(0);
      expect(ctx.balances.filter((b) => b.periodId === 'p2')).toHaveLength(0);
    });

    it('kết chuyển số dư Có (số dư thuần âm) sang cột dư Có', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-payable',
          periodId: 'p1',
          openingCredit: '2000.0000',
          creditTotal: '500.0000',
        }),
      ]);

      await ctx.service.carryForwardOpening(ctx.manager as never, 'p1', 'p2');

      const next = ctx.balances.find(
        (b) => b.accountId === 'acc-payable' && b.periodId === 'p2',
      );
      expect(next?.openingCredit).toBe('2500.0000');
      expect(next?.openingDebit).toBe('0.0000');
    });
  });

  describe('listByPeriod', () => {
    it('tính số dư cuối kỳ và sắp xếp theo mã tài khoản', async () => {
      const balances = [
        makeBalance({
          id: 'b1',
          accountId: 'acc-2',
          periodId: 'p1',
          openingDebit: '100.0000',
          debitTotal: '50.0000',
          account: { code: '5111', name: 'Doanh thu', type: AccountType.REVENUE } as never,
        }),
        makeBalance({
          id: 'b2',
          accountId: 'acc-1',
          periodId: 'p1',
          openingCredit: '200.0000',
          creditTotal: '25.0000',
          account: { code: '1111', name: 'Tiền mặt', type: AccountType.ASSET } as never,
        }),
      ];
      const ctx = buildService(balances);

      const views = await ctx.service.listByPeriod('p1');

      expect(views.map((v) => v.accountCode)).toEqual(['1111', '5111']);
      expect(views[0].closingCredit).toBe('225.0000');
      expect(views[0].closingDebit).toBe('0.0000');
      expect(views[1].closingDebit).toBe('150.0000');
    });

    it('số dư cuối kỳ là số dư thuần — Nợ và Có tự triệt tiêu', async () => {
      // Ghi nhận doanh thu 5.000.000 rồi đảo: phát sinh Nợ = phát sinh Có
      // ⇒ số dư cuối kỳ phải bằng 0, không phải 5.000.000 ở cả hai cột.
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-revenue',
          periodId: 'p1',
          debitTotal: '5000000.0000',
          creditTotal: '5000000.0000',
          account: {
            code: '511',
            name: 'Doanh thu',
            type: AccountType.REVENUE,
          } as never,
        }),
      ]);

      const views = await ctx.service.listByPeriod('p1');

      expect(views[0].closingDebit).toBe('0.0000');
      expect(views[0].closingCredit).toBe('0.0000');
      expect(views[0].debitTotal).toBe('5000000.0000');
      expect(views[0].creditTotal).toBe('5000000.0000');
    });

    it('số dư thuần âm thì hiển thị ở cột dư Có', async () => {
      const ctx = buildService([
        makeBalance({
          id: 'b1',
          accountId: 'acc-payable',
          periodId: 'p1',
          openingCredit: '1000.0000',
          debitTotal: '300.0000',
          account: {
            code: '331',
            name: 'Phải trả người bán',
            type: AccountType.LIABILITY,
          } as never,
        }),
      ]);

      const views = await ctx.service.listByPeriod('p1');

      expect(views[0].closingCredit).toBe('700.0000');
      expect(views[0].closingDebit).toBe('0.0000');
    });
  });
});
