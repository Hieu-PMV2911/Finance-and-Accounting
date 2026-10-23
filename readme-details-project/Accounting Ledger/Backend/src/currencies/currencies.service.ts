import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CompaniesService } from '../companies/companies.service.js';
import { normalizeCurrencyCode } from '../common/utils/currency.util.js';
import type { CreateCurrencyDto } from './dto/create-currency.dto.js';
import type { UpdateCurrencyDto } from './dto/update-currency.dto.js';
import { Currency } from './entities/currency.entity.js';
import { ExchangeRate } from './entities/exchange-rate.entity.js';

/**
 * Danh mục tiền tệ (mục 10.C.1).
 *
 * Service này **không** quyết định đơn vị tiền hạch toán — đó là việc của
 * `CompaniesService.baseCurrency()`. Nó chỉ quản lý danh mục các loại tiền được
 * phép dùng và giữ cờ `isBase` đồng bộ với cấu hình công ty, vì hai nguồn sự thật
 * lệch nhau là nguồn gốc của rất nhiều bút toán sai sau này.
 */
@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencies: Repository<Currency>,
    @InjectRepository(ExchangeRate)
    private readonly rates: Repository<ExchangeRate>,
    private readonly companies: CompaniesService,
  ) {}

  async list(includeInactive = false): Promise<Currency[]> {
    return this.currencies.find({
      where: includeInactive ? {} : { isActive: true },
      order: { isBase: 'DESC', code: 'ASC' },
    });
  }

  async findById(code: string): Promise<Currency> {
    const normalized = normalizeCurrencyCode(code);
    const currency = await this.currencies.findOne({
      where: { code: normalized },
    });
    if (!currency) {
      throw new NotFoundException(`Không tìm thấy loại tiền "${normalized}"`);
    }
    return currency;
  }

  /** Loại tiền này có tồn tại và đang hoạt động? Dùng khi kiểm tra dòng ngoại tệ. */
  async findActive(code: string): Promise<Currency | null> {
    return this.currencies.findOne({
      where: { code: normalizeCurrencyCode(code), isActive: true },
    });
  }

  async create(dto: CreateCurrencyDto): Promise<Currency> {
    const code = normalizeCurrencyCode(dto.code);

    const existing = await this.currencies.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Loại tiền "${code}" đã tồn tại`);
    }

    const baseCurrency = await this.companies.baseCurrency();
    // Cờ `isBase` **suy ra** từ cấu hình công ty, không nhận từ người dùng: chỉ có
    // đúng một đơn vị tiền hạch toán, và nó do `companies.base_currency` quyết định.
    const isBase = code === baseCurrency;

    if (isBase) {
      await this.currencies.update({ isBase: true }, { isBase: false });
    }

    return this.currencies.save(
      this.currencies.create({
        code,
        name: dto.name.trim(),
        decimals: dto.decimals ?? 2,
        isBase,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(code: string, dto: UpdateCurrencyDto): Promise<Currency> {
    const currency = await this.findById(code);

    if (dto.name !== undefined) {
      currency.name = dto.name.trim();
    }
    if (dto.decimals !== undefined) {
      currency.decimals = dto.decimals;
    }
    if (dto.isActive !== undefined) {
      if (currency.isBase && dto.isActive === false) {
        throw new BadRequestException(
          'Không thể ngừng sử dụng đơn vị tiền hạch toán — hãy đổi đơn vị tiền hạch toán của công ty trước',
        );
      }
      currency.isActive = dto.isActive;
    }

    return this.currencies.save(currency);
  }

  /**
   * Xóa loại tiền chưa dùng.
   *
   * Không xóa được đơn vị tiền hạch toán, và không xóa được loại tiền còn tỷ giá
   * (FK `RESTRICT` ở `exchange_rates` sẽ chặn — nhưng kiểm tra trước để trả lỗi rõ
   * nghĩa thay vì lỗi ràng buộc thô của Postgres).
   */
  async remove(code: string): Promise<void> {
    const currency = await this.findById(code);

    if (currency.isBase) {
      throw new BadRequestException(
        'Không thể xóa đơn vị tiền hạch toán',
      );
    }

    const rateCount = await this.rates.count({
      where: { currencyCode: currency.code },
    });
    if (rateCount > 0) {
      throw new ConflictException(
        `Loại tiền "${currency.code}" còn ${rateCount} bản ghi tỷ giá — hãy xóa tỷ giá trước`,
      );
    }

    await this.currencies.remove(currency);
  }

  /**
   * Đồng bộ cờ `isBase` theo `companies.baseCurrency`.
   *
   * Gọi ở lần seed/khởi động: nếu người dùng đổi `baseCurrency` của công ty mà chưa
   * tạo loại tiền tương ứng thì tạo luôn, và bỏ cờ của loại tiền cũ. Idempotent.
   */
  async syncBaseFlag(): Promise<string> {
    const baseCurrency = await this.companies.baseCurrency();

    const existing = await this.currencies.findOne({
      where: { code: baseCurrency },
    });
    if (!existing) {
      await this.currencies.save(
        this.currencies.create({
          code: baseCurrency,
          name: baseCurrency,
          decimals: baseCurrency === 'VND' ? 0 : 2,
          isBase: true,
          isActive: true,
        }),
      );
    } else if (!existing.isBase) {
      existing.isBase = true;
      existing.isActive = true;
      await this.currencies.save(existing);
    }

    await this.currencies
      .createQueryBuilder()
      .update(Currency)
      .set({ isBase: false })
      .where('code <> :baseCurrency', { baseCurrency })
      .andWhere('is_base = true')
      .execute();

    return baseCurrency;
  }
}
