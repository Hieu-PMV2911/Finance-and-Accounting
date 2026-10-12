import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountType } from '../common/enums/account-type.enum.js';
import { AccountsService } from './accounts.service.js';
import type { Account } from './entities/account.entity.js';

function makeAccount(partial: Partial<Account>): Account {
  return {
    id: 'id',
    code: '000',
    name: 'tài khoản',
    type: AccountType.ASSET,
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

function createRepoMock(seed: Account[] = []) {
  const store: Account[] = [...seed];
  let seq = 0;

  return {
    _store: store,
    find: vi.fn(async () => store.map((a) => a)),
    findOne: vi.fn(async (options: { where?: Record<string, unknown> }) => {
      const where = options?.where ?? {};
      if (where.id) return store.find((a) => a.id === where.id) ?? null;
      if (where.code) return store.find((a) => a.code === where.code) ?? null;
      return null;
    }),
    count: vi.fn(
      async (options: { where?: { parentId?: string } }) =>
        store.filter((a) => a.parentId === options?.where?.parentId).length,
    ),
    create: vi.fn((data: Partial<Account>) =>
      makeAccount({ ...data, id: data.id ?? `gen-${++seq}` }),
    ),
    save: vi.fn(async (entity: Account) => {
      const idx = store.findIndex((a) => a.id === entity.id);
      if (idx === -1) store.push(entity);
      else store[idx] = entity;
      return entity;
    }),
    remove: vi.fn(async (entity: Account) => {
      const idx = store.indexOf(entity);
      if (idx >= 0) store.splice(idx, 1);
      return entity;
    }),
    update: vi.fn(async () => ({ affected: 1 })),
  };
}

function buildService(seed: Account[] = []) {
  const repo = createRepoMock(seed);
  const service = new AccountsService(repo as never);
  return { service, repo };
}

describe('AccountsService', () => {
  let repo: ReturnType<typeof createRepoMock>;

  beforeEach(() => {
    repo = buildService().repo;
  });

  describe('tree', () => {
    it('dựng cây phân cấp với cấp (level) đúng', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '100', parentId: null }),
        makeAccount({ id: 'b', code: '110', parentId: 'a' }),
        makeAccount({ id: 'c', code: '111', parentId: 'b' }),
      ]);

      const tree = await built.service.tree();

      expect(tree).toHaveLength(1);
      expect(tree[0].code).toBe('100');
      expect(tree[0].level).toBe(1);
      expect(tree[0].children[0].level).toBe(2);
      expect(tree[0].children[0].children[0].level).toBe(3);
    });

    it('coi tài khoản có cha không tồn tại như tài khoản gốc', async () => {
      const built = buildService([
        makeAccount({ id: 'x', code: '999', parentId: 'missing' }),
      ]);

      const tree = await built.service.tree();
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('x');
    });
  });

  describe('create', () => {
    it('từ chối mã tài khoản trùng', async () => {
      const built = buildService([makeAccount({ id: 'a', code: '111' })]);

      await expect(
        built.service.create({ code: '111', name: 'Trùng', type: AccountType.ASSET }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('từ chối khi loại tài khoản con khác loại cha', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '111', type: AccountType.ASSET }),
      ]);

      await expect(
        built.service.create({
          code: '1111',
          name: 'Sai loại',
          type: AccountType.EXPENSE,
          parentId: 'a',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('đặt tài khoản cha thành không ghi sổ khi thêm con', async () => {
      const parent = makeAccount({ id: 'a', code: '111', isPostable: true });
      const built = buildService([parent]);

      await built.service.create({
        code: '1111',
        name: 'Tiền mặt VND',
        type: AccountType.ASSET,
        parentId: 'a',
      });

      expect(parent.isPostable).toBe(false);
    });
  });

  describe('update', () => {
    it('từ chối chuyển tài khoản vào chính nhánh của nó (chu trình)', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '100' }),
        makeAccount({ id: 'b', code: '110', parentId: 'a' }),
        makeAccount({ id: 'c', code: '111', parentId: 'b' }),
      ]);

      await expect(
        built.service.update('a', { parentId: 'c' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối bật ghi sổ khi tài khoản còn con', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '100', isPostable: false }),
        makeAccount({ id: 'b', code: '110', parentId: 'a' }),
      ]);

      await expect(
        built.service.update('a', { isPostable: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('từ chối xóa tài khoản còn tài khoản con', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '100' }),
        makeAccount({ id: 'b', code: '110', parentId: 'a' }),
      ]);

      await expect(built.service.remove('a')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('xóa được tài khoản lá', async () => {
      const built = buildService([makeAccount({ id: 'a', code: '111' })]);

      await built.service.remove('a');
      expect(repo._store).toHaveLength(0);
    });
  });

  describe('getPostable', () => {
    it('từ chối tài khoản tổng hợp', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '111', isPostable: false }),
      ]);

      await expect(built.service.getPostable('a')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('từ chối tài khoản đã ngừng sử dụng', async () => {
      const built = buildService([
        makeAccount({ id: 'a', code: '111', isActive: false }),
      ]);

      await expect(built.service.getPostable('a')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('trả về tài khoản lá hợp lệ', async () => {
      const built = buildService([makeAccount({ id: 'a', code: '111' })]);
      const account = await built.service.getPostable('a');
      expect(account.code).toBe('111');
    });
  });
});
