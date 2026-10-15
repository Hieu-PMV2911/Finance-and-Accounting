import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import type { Account } from '../accounts/entities/account.entity.js';
import {
  ACCOUNT_DEFAULT_SCOPE_LABELS,
  AccountDefaultScope,
  ANY_CATEGORY,
} from '../common/enums/account-default-scope.enum.js';
import { Role } from '../common/enums/role.enum.js';
import type { CreateAccountDefaultRuleDto } from './dto/create-account-default-rule.dto.js';
import type { QueryAccountDefaultRulesDto } from './dto/query-account-default-rules.dto.js';
import type { UpdateAccountDefaultRuleDto } from './dto/update-account-default-rule.dto.js';
import { AccountDefaultRule } from './entities/account-default-rule.entity.js';

/**
 * Vai trò được phép **ghi đè** tài khoản trên từng dòng chứng từ.
 *
 * Vì sao hẹp: quyết định thiết kế đã chốt là hệ thống mặc định lấy tài khoản theo cấu
 * hình. Cho người lập (`maker`) tự chọn tài khoản sẽ kéo sai lệch trở lại — đúng thứ
 * mà luật mặc định sinh ra để chặn. `poster` được phép vì họ là người chịu trách nhiệm
 * ghi sổ; `admin` để xử lý ngoại lệ.
 */
const LINE_OVERRIDE_ROLES: readonly Role[] = [Role.ADMIN, Role.POSTER];

/**
 * Mã tài khoản dùng khi **không có luật nào khớp** — lưới an toàn, không phải chính sách.
 * Muốn đổi chính sách thì thêm luật vào bảng, **không** sửa hằng số này.
 */
const SYSTEM_FALLBACK: Record<
  AccountDefaultScope,
  { prefix: string; label: string }
> = {
  [AccountDefaultScope.SALES]: { prefix: '511', label: 'doanh thu (511*)' },
  [AccountDefaultScope.PURCHASE]: { prefix: '642', label: 'chi phí (642*)' },
};

/** Ai đang lập chứng từ — chỉ cần `roles` để xét quyền ghi đè tài khoản. */
export interface AccountDefaultsActor {
  roles: readonly Role[];
}

export interface ResolveLineAccountInput {
  scope: AccountDefaultScope;
  /** Loại hàng hóa/dịch vụ trên dòng; bỏ trống ⇒ chỉ xét luật `*`. */
  category?: string | null;
  /** Tài khoản người dùng chỉ định trên dòng (ghi đè luật mặc định). */
  overrideAccountId?: string | null;
}

/** Vai trò này có được chỉ định tài khoản trên dòng chứng từ không? */
export function canOverrideLineAccount(roles: readonly Role[]): boolean {
  return roles.some((role) => LINE_OVERRIDE_ROLES.includes(role));
}

/**
 * Chuẩn hóa loại hàng hóa/dịch vụ để tra cứu **không phân biệt hoa thường** và
 * không phụ thuộc khoảng trắng thừa. `*` (mọi loại) giữ nguyên.
 */
export function normalizeCategory(category: string): string {
  return category.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Luật mặc định tài khoản (mục 10.A) — quyết định #1 của kế hoạch mục 10.
 *
 * Chịu trách nhiệm duy nhất: trả lời "dòng chứng từ này ghi vào tài khoản nào?" theo
 * thứ tự ưu tiên 4 tầng, và **chặn** việc ghi đè trái quyền. Không tự sinh bút toán —
 * việc ghi sổ vẫn thuộc `JournalsService`.
 */
@Injectable()
export class AccountDefaultsService {
  constructor(
    @InjectRepository(AccountDefaultRule)
    private readonly rules: Repository<AccountDefaultRule>,
    private readonly accounts: AccountsService,
  ) {}

  async list(
    query: QueryAccountDefaultRulesDto = {},
  ): Promise<AccountDefaultRule[]> {
    const qb = this.rules
      .createQueryBuilder('rule')
      .leftJoinAndSelect('rule.account', 'account')
      .orderBy('rule.scope', 'ASC')
      .addOrderBy('rule.category', 'ASC');

    if (query.scope) {
      qb.andWhere('rule.scope = :scope', { scope: query.scope });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('rule.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere('rule.category ILIKE :s', { s: `%${query.search}%` });
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<AccountDefaultRule> {
    const rule = await this.rules.findOne({
      where: { id },
      relations: { account: true },
    });
    if (!rule) {
      throw new NotFoundException('Không tìm thấy luật mặc định tài khoản');
    }
    return rule;
  }

  async create(dto: CreateAccountDefaultRuleDto): Promise<AccountDefaultRule> {
    const category = normalizeCategory(dto.category);
    // Chỉ tài khoản lá đang hoạt động mới được làm đích — luật trỏ vào tài khoản
    // tổng hợp sẽ làm mọi chứng từ sau đó ghi sổ thất bại.
    const account = await this.accounts.getPostable(dto.accountId);
    await this.assertPairAvailable(dto.scope, category);

    const rule = this.rules.create({
      scope: dto.scope,
      category,
      accountId: account.id,
      isActive: dto.isActive ?? true,
      description: dto.description?.trim() || null,
    });

    const saved = await this.rules.save(rule);
    return this.findById(saved.id);
  }

  async update(
    id: string,
    dto: UpdateAccountDefaultRuleDto,
  ): Promise<AccountDefaultRule> {
    const rule = await this.findById(id);

    const scope = dto.scope ?? rule.scope;
    const category = dto.category ? normalizeCategory(dto.category) : rule.category;

    if (scope !== rule.scope || category !== rule.category) {
      await this.assertPairAvailable(scope, category, id);
    }

    if (dto.accountId !== undefined && dto.accountId !== rule.accountId) {
      rule.accountId = (await this.accounts.getPostable(dto.accountId)).id;
    }

    rule.scope = scope;
    rule.category = category;
    rule.isActive = dto.isActive ?? rule.isActive;
    if (dto.description !== undefined) {
      rule.description = dto.description.trim() || null;
    }

    await this.rules.save(rule);
    return this.findById(id);
  }

  /**
   * Xóa luật — đây là **bảng cấu hình**, không phải chứng từ đã ghi sổ, nên xóa cứng
   * là hợp lệ và không phá tính bất biến của sổ cái.
   */
  async remove(id: string): Promise<void> {
    const rule = await this.findById(id);
    await this.rules.remove(rule);
  }

  /**
   * Giải tài khoản cho **một dòng chứng từ**, theo thứ tự ưu tiên:
   *
   * 1. tài khoản người dùng chỉ định trên dòng — **phải có quyền** (`admin` / `poster`),
   * 2. luật theo đúng `category`,
   * 3. luật `*` (mọi loại),
   * 4. mặc định hệ thống theo tiền tố mã tài khoản.
   *
   * Mọi nhánh đều trả về tài khoản **lá, đang hoạt động** — nhờ vậy nơi gọi không phải
   * tự kiểm lại, và chứng từ không bao giờ trỏ vào tài khoản tổng hợp.
   */
  async resolveLineAccount(
    input: ResolveLineAccountInput,
    actor: AccountDefaultsActor,
  ): Promise<Account> {
    const { scope, overrideAccountId } = input;

    if (overrideAccountId) {
      if (!canOverrideLineAccount(actor.roles)) {
        throw new ForbiddenException(
          'Bạn không có quyền chỉ định tài khoản trên dòng chứng từ — hệ thống dùng tài khoản mặc định theo cấu hình',
        );
      }
      return this.accounts.getPostable(overrideAccountId);
    }

    const rule = await this.findRule(scope, input.category);
    if (rule) {
      return this.accounts.getPostable(rule.accountId);
    }

    const fallback = SYSTEM_FALLBACK[scope];
    const account = await this.accounts.findOneByCodePattern(fallback.prefix);
    if (account) {
      return this.accounts.getPostable(account.id);
    }

    throw new BadRequestException(
      `Chưa cấu hình tài khoản ${fallback.label} cho "${ACCOUNT_DEFAULT_SCOPE_LABELS[scope]}" — ` +
        'hãy khai luật mặc định tài khoản (POST /api/account-defaults) hoặc chỉ định tài khoản trên dòng',
    );
  }

  // ---------------------------------------------------------------- helpers

  /** Luật đúng loại hàng hóa/dịch vụ; không có thì lấy luật `*`. */
  private async findRule(
    scope: AccountDefaultScope,
    category?: string | null,
  ): Promise<AccountDefaultRule | null> {
    const wanted = category?.trim() ? normalizeCategory(category) : null;

    if (wanted) {
      const exact = await this.rules.findOne({
        where: { scope, category: wanted, isActive: true },
      });
      if (exact) {
        return exact;
      }
    }

    return this.rules.findOne({
      where: { scope, category: ANY_CATEGORY, isActive: true },
    });
  }

  private async assertPairAvailable(
    scope: AccountDefaultScope,
    category: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.rules.findOne({ where: { scope, category } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(
        `Đã có luật cho "${ACCOUNT_DEFAULT_SCOPE_LABELS[scope]}" với loại "${category}" — sửa luật đó thay vì tạo thêm`,
      );
    }
  }
}
