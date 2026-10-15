import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { CompaniesService } from '../companies/companies.service.js';
import {
  convertToBase,
  fxRateToString,
  normalizeCurrencyCode,
} from '../common/utils/currency.util.js';
import { toMoney } from '../common/utils/money.util.js';
import { CurrenciesService } from './currencies.service.js';
import type {
  QueryExchangeRatesDto,
} from './dto/query-exchange-rates.dto.js';
import type { UpsertExchangeRateDto } from './dto/upsert-exchange-rate.dto.js';
import { ExchangeRate } from './entities/exchange-rate.entity.js';

/** Tỷ giá của chính đơn vị tiền hạch toán — luôn là 1, không cần bản ghi trong bảng. */
export const BASE_RATE = '1.00000000';

/** Kết quả tra cứu tỷ giá — kèm ngày thật sự được dùng để truy vết. */
export interface ResolvedRate {
  currency: string;
  baseCurrency: string;
  rate: string;
  /** Ngày của bản ghi tỷ giá được dùng (có thể sớm hơn `asOfDate`). */
  rateDate: string;
  /** `true` khi tỷ giá lấy từ bản ghi cũ hơn ngày cần tra (không có tỷ giá đúng ngày). */
  fallback: boolean;
  source: string;
}

/**
 * Bảng tỷ giá nhập tay (mục 10.C.1).
 *
 * Quy tắc tra cứu: **tỷ giá của ngày gần nhất không muộn hơn ngày cần tra**. Đây là
 * quy tắc kế toán đúng — tỷ giá có hiệu lực cho tới khi có tỷ giá mới — và nó cũng
 * tránh được lỗi "chủ nhật không có tỷ giá nên không ghi sổ được".
 *
 * Vì sao **không** nội suy giữa hai mốc: nội suy tạo ra một con số chưa từng được
 * công bố, không truy vết được nguồn. Thà dùng tỷ giá cũ gần nhất và ghi rõ
 * `fallback: true` để người dùng biết mà kiểm tra.
 */
@Injectable()
export class ExchangeRatesService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly rates: Repository<ExchangeRate>,
    private readonly currencies: CurrenciesService,
    private readonly companies: CompaniesService,
  ) {}

  /** Đơn vị tiền hạch toán đang dùng — tiện cho nơi gọi chỉ cần biết một lần. */
  async baseCurrency(): Promise<string> {
    return this.companies.baseCurrency();
  }

  async list(query: QueryExchangeRatesDto = {}): Promise<ExchangeRate[]> {
    const qb = this.rates
      .createQueryBuilder('rate')
      .orderBy('rate.rateDate', 'DESC')
      .addOrderBy('rate.currencyCode', 'ASC')
      .take(query.limit ?? 100)
      .skip(query.offset ?? 0);

    if (query.currency) {
      qb.andWhere('rate.currencyCode = :currency', {
        currency: normalizeCurrencyCode(query.currency),
      });
    }
    if (query.fromDate) {
      qb.andWhere('rate.rateDate >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('rate.rateDate <= :toDate', { toDate: query.toDate });
    }

    return qb.getMany();
  }

  /**
   * Ghi tỷ giá — **upsert** theo `(currencyCode, rateDate)`.
   *
   * Ghi lại cùng ngày là cập nhật, không tạo dòng thứ hai. Nhờ vậy "tỷ giá của ngày
   * X" luôn xác định, và người dùng sửa được tỷ giá nhập sai mà không để lại rác.
   *
   * Không cho ghi tỷ giá cho chính đơn vị tiền hạch toán: nó luôn là 1, và một bản
   * ghi `VND → VND = 25xxx` sẽ là dữ liệu vô nghĩa nhưng trông rất hợp lệ.
   */
  async upsert(dto: UpsertExchangeRateDto): Promise<ExchangeRate> {
    const currency = normalizeCurrencyCode(dto.currency);
    const baseCurrency = await this.companies.baseCurrency();

    if (currency === baseCurrency) {
      throw new BadRequestException(
        `Không cần khai tỷ giá cho đơn vị tiền hạch toán (${baseCurrency}) — tỷ giá của nó luôn bằng 1`,
      );
    }

    // FK tới `currencies` là ràng buộc thật ở DB; kiểm tra trước để thông báo rõ
    // nghĩa ("chưa khai loại tiền") thay vì lỗi khóa ngoại thô.
    const known = await this.currencies.findActive(currency);
    if (!known) {
      throw new NotFoundException(
        `Chưa khai loại tiền "${currency}" trong danh mục — hãy tạo loại tiền trước khi nhập tỷ giá`,
      );
    }

    const rate = toMoney(dto.rate);
    if (!rate.greaterThan(0)) {
      throw new BadRequestException('Tỷ giá phải lớn hơn 0');
    }

    const existing = await this.rates.findOne({
      where: { currencyCode: currency, rateDate: dto.rateDate },
    });

    const value = fxRateToString(rate);
    if (existing) {
      existing.rate = value;
      existing.source = dto.source?.trim() || 'manual';
      existing.note = dto.note?.trim() || null;
      return this.rates.save(existing);
    }

    return this.rates.save(
      this.rates.create({
        currencyCode: currency,
        rateDate: dto.rateDate,
        rate: value,
        source: dto.source?.trim() || 'manual',
        note: dto.note?.trim() || null,
      }),
    );
  }

  async remove(id: string): Promise<void> {
    const rate = await this.rates.findOne({ where: { id } });
    if (!rate) {
      throw new NotFoundException('Không tìm thấy bản ghi tỷ giá');
    }
    await this.rates.remove(rate);
  }

  /**
   * Tra tỷ giá áp dụng cho một ngày.
   *
   * Trả `null` khi loại tiền là đơn vị tiền hạch toán (tỷ giá 1) **hoặc** khi chưa
   * có bản ghi nào. Phân biệt hai trường hợp này quan trọng: cái đầu là bình thường,
   * cái sau là thiếu dữ liệu cần chặn. Vì vậy nơi gọi phải dùng `requireRate()` khi
   * thật sự cần một con số.
   */
  async findApplicable(
    currency: string,
    asOfDate: string,
  ): Promise<ResolvedRate | null> {
    const code = normalizeCurrencyCode(currency);
    const baseCurrency = await this.companies.baseCurrency();

    if (code === baseCurrency) {
      return {
        currency: code,
        baseCurrency,
        rate: BASE_RATE,
        rateDate: asOfDate,
        fallback: false,
        source: 'base',
      };
    }

    const found = await this.rates.findOne({
      where: { currencyCode: code, rateDate: LessThanOrEqual(asOfDate) },
      order: { rateDate: 'DESC' },
    });

    if (!found) {
      return null;
    }

    return {
      currency: code,
      baseCurrency,
      rate: fxRateToString(found.rate),
      rateDate: found.rateDate,
      fallback: found.rateDate !== asOfDate,
      source: found.source,
    };
  }

  /**
   * Tra tỷ giá **bắt buộc có** — dùng khi ghi sổ dòng ngoại tệ mà người dùng không
   * khai tỷ giá. Thiếu tỷ giá thì **chặn**, không tự lấy 1 hay bỏ qua dòng.
   */
  async requireRate(currency: string, asOfDate: string): Promise<ResolvedRate> {
    const resolved = await this.findApplicable(currency, asOfDate);
    if (!resolved) {
      const baseCurrency = await this.companies.baseCurrency();
      throw new BadRequestException(
        `Chưa có tỷ giá cho ${normalizeCurrencyCode(currency)} tại ngày ${asOfDate} ` +
          `(đơn vị tiền hạch toán: ${baseCurrency}). Hãy khai tỷ giá qua POST /api/exchange-rates ` +
          'hoặc truyền fxRate trực tiếp trên dòng.',
      );
    }
    return resolved;
  }

  /** Quy đổi một số tiền ngoại tệ về tiền hạch toán theo tỷ giá áp dụng của ngày. */
  async convert(
    amount: string,
    currency: string,
    asOfDate: string,
  ): Promise<{ baseAmount: string; rate: string; rateDate: string }> {
    const resolved = await this.requireRate(currency, asOfDate);
    return {
      baseAmount: convertToBase(amount, resolved.rate),
      rate: resolved.rate,
      rateDate: resolved.rateDate,
    };
  }

  /** Tỷ giá mới nhất của từng loại tiền — dùng cho màn hình nhập liệu và seed. */
  async latestPerCurrency(): Promise<ResolvedRate[]> {
    const baseCurrency = await this.companies.baseCurrency();
    const currencies = await this.currencies.list();
    const result: ResolvedRate[] = [];

    for (const currency of currencies) {
      if (currency.code === baseCurrency) continue;
      const found = await this.rates.findOne({
        where: { currencyCode: currency.code },
        order: { rateDate: 'DESC' },
      });
      if (found) {
        result.push({
          currency: currency.code,
          baseCurrency,
          rate: fxRateToString(found.rate),
          rateDate: found.rateDate,
          fallback: false,
          source: found.source,
        });
      }
    }

    return result;
  }
}
