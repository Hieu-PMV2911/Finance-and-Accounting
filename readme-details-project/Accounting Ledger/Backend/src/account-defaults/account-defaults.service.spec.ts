import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Account } from '../accounts/entities/account.entity.js';
import { AccountType } from '../common/enums/account-type.enum.js';
import {
  AccountDefaultScope,
  ANY_CATEGORY,
} from '../common/enums/account-default-scope.enum.js';
import { Role } from '../common/enums/role.enum.js';
import {
  AccountDefaultsService,
  canOverrideLineAccount,
  normalizeCategory,
} from './account-defaults.service.js';
import type { AccountDefaultRule } from './entities/account-default-rule.entity.js';

function makeAccount(partial: Partial<Account>): Account {
  return {
    id: 'acc',
    code: '0000',
    name: 'tài khoản',
    type: AccountType.REVENUE,
    parentId: null,
    parent: null,
    children: [],
    isPostable: true,
    isActive: true,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Account;
}

function makeRule(partial: Partial<AccountDefaultRule>): AccountDefaultRule {
  return {
    id: 'rule-1',
    scope: AccountDefaultScope.SALES,
    category: ANY_CATEGORY,
    accountId: 'acc-511',
    account: makeAccount({ id: 'acc-511', code: '5111' }),
    isActive: true,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as AccountDefaultRule;
}

/** Mock repository chỉ đủ dùng: so khớp `where` bằng giá trị, cộng create/save/remove. */
function createRulesRepoMock(seed: AccountDefaultRule[] = []) {
  const store: AccountDefaultRule[] = [...seed];
  let seq = 0;

  return {
    _store: store,
    findOne: vi.fn(async (options: { where?: Record<string, unknown> }) => {
      const where = options?.where ?? {};
      const found = store.find((rule) =>
        Object.entries(where).every(([field, expected]) => {
          const actual = (rule as unknown as Record<string, unknown>)[field];
          return actual === expected;
        }),
      );
      return found ?? null;
    }),
    create: vi.fn((data: Partial<AccountDefaultRule>) =>
      makeRule({ ...data, id: data.id ?? `gen-${++seq}` }),
    ),
    save: vi.fn(async (rule: AccountDefaultRule) => {
      const idx = store.findIndex((r) => r.id === rule.id);
      if (idx === -1) store.push(rule);
      else store[idx] = rule;
      return rule;
    }),
    remove: vi.fn(async (rule: AccountDefaultRule) => {
      const idx = store.indexOf(rule);
      if (idx >= 0) store.splice(idx, 1);
      return rule;
    }),
  };
}

function createAccountsMock(accounts: Account[] = []) {
  return {
    getPostable: vi.fn(async (id: string) => {
      const found = accounts.find((a) => a.id === id);
      if (!found) {
        throw new BadRequestException(`Không tìm thấy tài khoản ${id}`);
      }
      return found;
    }),
    findOneByCodePattern: vi.fn(
      async (prefix: string) =>
        accounts.find((a) => a.code.startsWith(prefix)) ?? null,
    ),
  };
}

function buildService(
  rules: AccountDefaultRule[] = [],
  accounts: Account[] = [],
) {
  const rulesRepo = createRulesRepoMock(rules);
  const accountsMock = createAccountsMock(accounts);
  const service = new AccountDefaultsService(
    rulesRepo as never,
    accountsMock as never,
  );
  return { service, rulesRepo, accountsMock };
}

const POSTER = { roles: [Role.POSTER] };
const MAKER = { roles: [Role.MAKER] };

describe('AccountDefaultsService', () => {
  describe('normalizeCategory', () => {
    it('trim, gộp khoảng trắng và hạ chữ thường', () => {
      expect(normalizeCategory('  Dịch Vụ   Tư Vấn ')).toBe('dịch vụ tư vấn');
    });
  });

  describe('canOverrideLineAccount', () => {
    it('chỉ admin và poster được ghi đè tài khoản trên dòng', () => {
      expect(canOverrideLineAccount([Role.ADMIN])).toBe(true);
      expect(canOverrideLineAccount([Role.POSTER])).toBe(true);
      expect(canOverrideLineAccount([Role.MAKER])).toBe(false);
      expect(canOverrideLineAccount([Role.CHECKER])).toBe(false);
    });
  });

  describe('resolveLineAccount', () => {
    it('chặn người lập ghi đè tài khoản trên dòng', async () => {
      const built = buildService();

      await expect(
        built.service.resolveLineAccount(
          {
            scope: AccountDefaultScope.SALES,
            overrideAccountId: 'acc-511',
          },
          MAKER,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cho poster ghi đè và trả về tài khoản đã chỉ định', async () => {
      const built = buildService(
        [],
        [makeAccount({ id: 'acc-711', code: '7111' })],
      );

      const account = await built.service.resolveLineAccount(
        { scope: AccountDefaultScope.SALES, overrideAccountId: 'acc-711' },
        POSTER,
      );

      expect(account.id).toBe('acc-711');
    });

    it('ưu tiên luật đúng loại hàng hóa/dịch vụ', async () => {
      const built = buildService(
        [
          makeRule({
            id: 'any',
            category: ANY_CATEGORY,
            accountId: 'acc-any',
          }),
          makeRule({
            id: 'exact',
            category: 'dịch vụ tư vấn',
            accountId: 'acc-exact',
          }),
        ],
        [
          makeAccount({ id: 'acc-any', code: '5118' }),
          makeAccount({ id: 'acc-exact', code: '5113' }),
        ],
      );

      const account = await built.service.resolveLineAccount(
        { scope: AccountDefaultScope.SALES, category: 'Dịch vụ  tư vấn' },
        MAKER,
      );

      expect(account.id).toBe('acc-exact');
    });

    it('rơi về luật "*" khi chưa khai loại cụ thể', async () => {
      const built = buildService(
        [makeRule({ category: ANY_CATEGORY, accountId: 'acc-any' })],
        [makeAccount({ id: 'acc-any', code: '5111' })],
      );

      const account = await built.service.resolveLineAccount(
        { scope: AccountDefaultScope.SALES, category: 'loại chưa khai' },
        MAKER,
      );

      expect(account.id).toBe('acc-any');
    });

    it('bỏ qua luật đã ngừng áp dụng', async () => {
      const built = buildService(
        [],
        [makeAccount({ id: 'acc-fallback', code: '5112' })],
      );
      built.rulesRepo._store.push(
        makeRule({ category: ANY_CATEGORY, isActive: false, accountId: 'acc-off' }),
      );

      const account = await built.service.resolveLineAccount(
        { scope: AccountDefaultScope.SALES },
        MAKER,
      );

      // Không có luật nào đang áp dụng ⇒ rơi về mặc định hệ thống theo tiền tố 511.
      expect(account.id).toBe('acc-fallback');
    });

    it('rơi về mặc định hệ thống theo tiền tố khi chưa có luật nào', async () => {
      const built = buildService(
        [],
        [makeAccount({ id: 'acc-511', code: '5111' })],
      );

      const account = await built.service.resolveLineAccount(
        { scope: AccountDefaultScope.SALES },
        MAKER,
      );

      expect(built.accountsMock.findOneByCodePattern).toHaveBeenCalledWith('511');
      expect(account.id).toBe('acc-511');
    });

    it('báo lỗi rõ ràng khi không có luật và cũng không có tài khoản hệ thống', async () => {
      const built = buildService([], []);

      await expect(
        built.service.resolveLineAccount(
          { scope: AccountDefaultScope.PURCHASE },
          MAKER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create', () => {
    it('chuẩn hóa loại hàng hóa/dịch vụ trước khi lưu', async () => {
      const built = buildService([], [makeAccount({ id: 'acc-511' })]);

      const rule = await built.service.create({
        scope: AccountDefaultScope.SALES,
        category: '  Dịch Vụ Tư Vấn ',
        accountId: 'acc-511',
      });

      expect(rule.category).toBe('dịch vụ tư vấn');
    });

    it('chặn tạo trùng cặp (scope, category)', async () => {
      const built = buildService(
        [makeRule({ category: 'dịch vụ tư vấn' })],
        [makeAccount({ id: 'acc-511' })],
      );

      await expect(
        built.service.create({
          scope: AccountDefaultScope.SALES,
          category: 'DỊCH VỤ TƯ VẤN',
          accountId: 'acc-511',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('từ chối tài khoản đích không phải tài khoản lá đang hoạt động', async () => {
      const built = buildService([], []);

      await expect(
        built.service.create({
          scope: AccountDefaultScope.SALES,
          category: 'dịch vụ',
          accountId: 'không-tồn-tại',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('chặn đổi sang cặp (scope, category) đã có luật khác', async () => {
      const built = buildService(
        [
          makeRule({ id: 'a', category: ANY_CATEGORY }),
          makeRule({ id: 'b', category: 'dịch vụ tư vấn' }),
        ],
        [makeAccount({ id: 'acc-511' })],
      );

      await expect(
        built.service.update('b', { category: ANY_CATEGORY }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cho phép giữ nguyên cặp của chính nó', async () => {
      const built = buildService(
        [makeRule({ id: 'a', category: 'dịch vụ tư vấn' })],
        [makeAccount({ id: 'acc-511' })],
      );

      const rule = await built.service.update('a', {
        category: 'Dịch vụ tư vấn',
        isActive: false,
      });

      expect(rule.isActive).toBe(false);
    });
  });

  describe('remove', () => {
    it('xóa được luật (bảng cấu hình, không phải chứng từ)', async () => {
      const built = buildService([makeRule({ id: 'a' })]);

      await built.service.remove('a');

      expect(built.rulesRepo._store).toHaveLength(0);
    });
  });
});
