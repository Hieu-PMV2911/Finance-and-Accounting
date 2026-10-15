import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { normalBalanceOf } from '../common/enums/account-type.enum.js';
import type { CreateAccountDto } from './dto/create-account.dto.js';
import type { QueryAccountsDto } from './dto/query-accounts.dto.js';
import type { UpdateAccountDto } from './dto/update-account.dto.js';
import { Account } from './entities/account.entity.js';
import type { AccountNode } from './interfaces/account-node.interface.js';

function toNode(account: Account): Omit<AccountNode, 'level' | 'children'> {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    parentId: account.parentId,
    isPostable: account.isPostable,
    isActive: account.isActive,
    description: account.description,
    normalBalance: normalBalanceOf(account.type),
  };
}

/**
 * Chart of Accounts — hệ thống tài khoản kế toán.
 *
 * Chịu trách nhiệm bảo vệ các bất biến của danh mục tài khoản:
 * mã duy nhất, con cùng loại với cha, không tạo chu trình, chỉ tài khoản lá
 * được ghi sổ.
 */
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}

  /** Danh sách phẳng, hỗ trợ lọc theo loại / trạng thái / tài khoản cha / từ khóa. */
  async list(query: QueryAccountsDto = {}): Promise<Account[]> {
    const qb = this.accounts
      .createQueryBuilder('account')
      .orderBy('account.code', 'ASC');

    if (query.type) {
      qb.andWhere('account.type = :type', { type: query.type });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('account.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.parentId) {
      qb.andWhere('account.parentId = :parentId', { parentId: query.parentId });
    }
    if (query.search) {
      qb.andWhere('(account.code ILIKE :s OR account.name ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    return qb.getMany();
  }

  /** Cây tài khoản phân cấp (gốc = level 1). */
  async tree(): Promise<AccountNode[]> {
    const accounts = await this.accounts.find({ order: { code: 'ASC' } });
    const ids = new Set(accounts.map((a) => a.id));

    const childrenOf = new Map<string | null, Account[]>();
    for (const account of accounts) {
      // Tài khoản trỏ tới cha không tồn tại được coi như gốc.
      const key = account.parentId && ids.has(account.parentId) ? account.parentId : null;
      const bucket = childrenOf.get(key) ?? [];
      bucket.push(account);
      childrenOf.set(key, bucket);
    }

    const build = (parentKey: string | null, level: number): AccountNode[] =>
      (childrenOf.get(parentKey) ?? []).map((account) => ({
        ...toNode(account),
        level,
        children: build(account.id, level + 1),
      }));

    return build(null, 1);
  }

  async findById(id: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    return account;
  }

  /**
   * Tài khoản **lá, đang hoạt động** đầu tiên có mã bắt đầu bằng `prefix`.
   *
   * Dùng để lấy tài khoản mặc định theo tiền tố TT200 (vd `131` phải thu khách hàng,
   * `331` phải trả người bán) mà **không hardcode id** — xem mục 10.0 của
   * `EXTENSION_PLAN.md`. Trả `null` khi chưa cấu hình, để nơi gọi tự quyết định
   * thông báo lỗi.
   */
  async findOneByCodePattern(prefix: string): Promise<Account | null> {
    const code = prefix.trim();
    if (!code) {
      return null;
    }
    return this.accounts.findOne({
      where: { code: Like(`${code}%`), isPostable: true, isActive: true },
      order: { code: 'ASC' },
    });
  }

  /**
   * Lấy tài khoản **kiểm soát** để ghi sổ theo tiền tố mã (131/331/111/112…).
   *
   * Khác `findOneByCodePattern` ở chỗ **không im lặng**: chưa cấu hình tài khoản thì báo
   * lỗi kèm hướng dẫn, và kết quả luôn là tài khoản **lá, đang hoạt động**. Dùng chung cho
   * hóa đơn bán/mua và phiếu thu/chi để ba nơi không tự viết lại cùng một quy tắc.
   */
  async requirePostableByCodePrefix(
    prefix: string,
    label: string,
  ): Promise<Account> {
    const found = await this.findOneByCodePattern(prefix);
    if (!found) {
      throw new BadRequestException(
        `Không tìm thấy tài khoản ${label} để ghi sổ chứng từ`,
      );
    }
    return this.getPostable(found.id);
  }

  /**
   * Lấy tài khoản để ghi sổ — chặn nếu tài khoản tổng hợp hoặc đã ngừng dùng.
   * Dùng bởi module Journals khi tạo bút toán.
   */
  async getPostable(id: string): Promise<Account> {
    const account = await this.findById(id);
    if (!account.isActive) {
      throw new BadRequestException(
        `Tài khoản ${account.code} đã ngừng sử dụng`,
      );
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `Tài khoản ${account.code} là tài khoản tổng hợp — chỉ ghi sổ vào tài khoản lá`,
      );
    }
    return account;
  }

  async create(dto: CreateAccountDto): Promise<Account> {
    const code = dto.code.trim();
    await this.assertCodeAvailable(code);

    let parent: Account | null = null;
    if (dto.parentId) {
      parent = await this.findById(dto.parentId);
      if (parent.type !== dto.type) {
        throw new BadRequestException(
          'Loại tài khoản con phải trùng với loại tài khoản cha',
        );
      }
    }

    const account = this.accounts.create({
      code,
      name: dto.name.trim(),
      type: dto.type,
      parentId: parent?.id ?? null,
      isPostable: dto.isPostable ?? true,
      isActive: dto.isActive ?? true,
      description: dto.description?.trim() ?? null,
    });

    const saved = await this.accounts.save(account);

    // Tài khoản cha có con → không thể ghi sổ trực tiếp.
    if (parent && parent.isPostable) {
      parent.isPostable = false;
      await this.accounts.save(parent);
    }

    return saved;
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    const account = await this.findById(id);
    const parentsToRefresh = new Set<string>();

    if (dto.code !== undefined && dto.code.trim() !== account.code) {
      const code = dto.code.trim();
      await this.assertCodeAvailable(code, id);
      account.code = code;
    }

    if (dto.name !== undefined) {
      account.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      account.description = dto.description?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      account.isActive = dto.isActive;
    }

    if (dto.type !== undefined && dto.type !== account.type) {
      await this.assertTypeChangeAllowed(account, dto.type);
      account.type = dto.type;
    }

    if (dto.parentId !== undefined) {
      const newParentId = dto.parentId ?? null;
      if (newParentId !== account.parentId) {
        await this.validateNewParent(account, newParentId);
        if (account.parentId) {
          parentsToRefresh.add(account.parentId);
        }
        if (newParentId) {
          parentsToRefresh.add(newParentId);
        }
        account.parentId = newParentId;
      }
    }

    if (dto.isPostable !== undefined) {
      if (dto.isPostable && (await this.hasChildren(id))) {
        throw new BadRequestException(
          'Tài khoản đang có tài khoản con nên không thể ghi sổ trực tiếp',
        );
      }
      account.isPostable = dto.isPostable;
    }

    const saved = await this.accounts.save(account);

    // Cập nhật lại khả năng ghi sổ của các tài khoản cha bị ảnh hưởng.
    for (const parentId of parentsToRefresh) {
      await this.refreshPostable(parentId);
    }

    return saved;
  }

  async remove(id: string): Promise<void> {
    const account = await this.findById(id);

    if (await this.hasChildren(id)) {
      throw new ConflictException(
        'Không thể xóa tài khoản còn tài khoản con',
      );
    }
    // TODO(journals): chặn xóa khi tài khoản đã phát sinh bút toán.

    await this.accounts.remove(account);

    // Cha trở thành lá → cho phép ghi sổ lại.
    if (account.parentId) {
      await this.refreshPostable(account.parentId);
    }
  }

  // ---------------------------------------------------------------- helpers

  private hasChildren(parentId: string): Promise<boolean> {
    return this.accounts
      .count({ where: { parentId } })
      .then((count) => count > 0);
  }

  private async assertCodeAvailable(code: string, exceptId?: string): Promise<void> {
    const existing = await this.accounts.findOne({ where: { code } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Mã tài khoản "${code}" đã tồn tại`);
    }
  }

  private async assertTypeChangeAllowed(
    account: Account,
    newType: Account['type'],
  ): Promise<void> {
    if (account.parentId) {
      const parent = await this.findById(account.parentId);
      if (parent.type !== newType) {
        throw new BadRequestException(
          'Loại tài khoản phải trùng với loại tài khoản cha',
        );
      }
    }
    if (await this.hasChildren(account.id)) {
      throw new BadRequestException(
        'Không thể đổi loại tài khoản khi còn tài khoản con',
      );
    }
  }

  private async validateNewParent(
    account: Account,
    newParentId: string | null,
  ): Promise<void> {
    if (newParentId === null) {
      return;
    }
    if (newParentId === account.id) {
      throw new BadRequestException('Tài khoản không thể là cha của chính nó');
    }

    const parent = await this.findById(newParentId);
    if (parent.type !== account.type) {
      throw new BadRequestException(
        'Loại tài khoản con phải trùng với loại tài khoản cha',
      );
    }

    await this.assertNoCycle(account.id, newParentId);
  }

  /** Đi ngược từ cha mới lên gốc; gặp chính tài khoản ⇒ có chu trình. */
  private async assertNoCycle(accountId: string, newParentId: string): Promise<void> {
    const visited = new Set<string>();
    let current: string | null = newParentId;

    while (current) {
      if (current === accountId) {
        throw new BadRequestException(
          'Không thể chuyển tài khoản vào chính nhánh của nó',
        );
      }
      if (visited.has(current)) {
        break; // dữ liệu bất thường — thoát an toàn
      }
      visited.add(current);
      const node: Account | null = await this.accounts.findOne({
        where: { id: current },
      });
      current = node?.parentId ?? null;
    }
  }

  /** Tài khoản có con ⇒ isPostable = false; ngược lại ⇒ true. */
  private async refreshPostable(accountId: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      return;
    }
    const shouldBePostable = !(await this.hasChildren(accountId));
    if (account.isPostable !== shouldBePostable) {
      account.isPostable = shouldBePostable;
      await this.accounts.save(account);
    }
  }
}
