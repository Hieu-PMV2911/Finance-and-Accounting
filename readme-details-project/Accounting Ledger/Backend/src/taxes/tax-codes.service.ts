import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import type { Account } from '../accounts/entities/account.entity.js';
import {
  TAX_TYPE_LABELS,
  TaxType,
  VAT_INPUT_ACCOUNT_PREFIX,
  VAT_OUTPUT_ACCOUNT_PREFIX,
} from '../common/enums/tax-code.enum.js';
import {
  computeTaxAmount,
  isTaxRateInRange,
  MAX_TAX_RATE_PERCENT,
  taxRateToString,
} from '../common/utils/tax.util.js';
import {
  moneyToString,
  sumMoney,
  toMoney,
} from '../common/utils/money.util.js';
import type { CreateTaxCodeDto } from './dto/create-tax-code.dto.js';
import type { QueryTaxCodesDto } from './dto/query-tax-codes.dto.js';
import type { UpdateTaxCodeDto } from './dto/update-tax-code.dto.js';
import { TaxCode } from './entities/tax-code.entity.js';

/** Chiều áp dụng thuế — quyết định tài khoản đích và ý nghĩa của số thuế. */
export type TaxDirection = 'output' | 'input';

/** Thuế suất đã chốt cho một dòng chứng từ. */
export interface ResolvedLineTax {
  taxCodeId: string | null;
  taxCode: string | null;
  /** Thuế suất phần trăm đã sao lại (`0.0000` khi dòng không chịu thuế). */
  taxRate: string;
}

/** Thuế đã chốt cho một dòng **kèm tiền thuế** đã làm tròn. */
export interface ResolvedLineTaxAmount extends ResolvedLineTax {
  /** Tiền thuế của dòng = `amount × taxRate / 100`, làm tròn 4 chữ số thập phân. */
  taxAmount: string;
}

/** Dòng chứng từ tối thiểu mà bộ máy thuế cần — không phụ thuộc hóa đơn bán/mua. */
export interface TaxableLineInput {
  amount: string;
  taxCodeId?: string | null;
}

/** Thuế gom theo tài khoản đích — dùng để sinh dòng bút toán. */
export interface VatAccountGroup {
  accountId: string;
  /** Tổng tiền thuế (đã làm tròn theo dòng) của nhóm. */
  amount: string;
}

/**
 * Mã thuế (mục 10.C.2).
 *
 * Hai trách nhiệm, cố ý tách bạch:
 *
 * 1. **Danh mục** — CRUD mã thuế (thuế suất + tài khoản đích). Là dữ liệu cấu hình,
 *    không phải hằng số trong code, vì luật thuế VN thay đổi theo thời gian.
 * 2. **Giải thuế cho một dòng** — `resolveLineTax` (thuế suất để **sao lại** vào dòng)
 *    và `resolveVatAccount` (tài khoản thuế để ghi sổ).
 *
 * Vì sao **sao lại** thuế suất vào dòng thay vì chỉ tham chiếu `tax_codes`: chứng từ
 * đã ghi sổ là bất biến, nên sửa thuế suất trong danh mục **không được** làm thay đổi
 * số liệu cũ. Đây cùng nguyên tắc với `journal_lines.fx_rate` ở 10.C.1.
 *
 * Vì sao service này **không** quyết định tài khoản doanh thu/chi phí: quyết định #1
 * chốt rằng việc đó thuộc `AccountDefaultsService`. Trộn hai việc vào nhau sẽ khiến
 * một thay đổi thuế suất vô tình đổi cả tài khoản doanh thu.
 */
@Injectable()
export class TaxCodesService {
  constructor(
    @InjectRepository(TaxCode)
    private readonly taxCodes: Repository<TaxCode>,
    private readonly accounts: AccountsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async list(query: QueryTaxCodesDto = {}): Promise<TaxCode[]> {
    const qb = this.taxCodes
      .createQueryBuilder('tax')
      .orderBy('tax.code', 'ASC');

    if (query.type) {
      qb.andWhere('tax.type = :type', { type: query.type });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('tax.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere('(tax.code ILIKE :s OR tax.name ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<TaxCode> {
    const taxCode = await this.taxCodes.findOne({ where: { id } });
    if (!taxCode) {
      throw new NotFoundException('Không tìm thấy mã thuế');
    }
    return taxCode;
  }

  async findByCode(code: string): Promise<TaxCode> {
    const taxCode = await this.taxCodes.findOne({
      where: { code: code.trim().toUpperCase() },
    });
    if (!taxCode) {
      throw new NotFoundException(`Không tìm thấy mã thuế "${code}"`);
    }
    return taxCode;
  }

  async create(dto: CreateTaxCodeDto): Promise<TaxCode> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.taxCodes.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Mã thuế "${code}" đã tồn tại`);
    }

    const rate = this.assertRate(dto.rate);

    return this.taxCodes.save(
      this.taxCodes.create({
        code,
        name: dto.name.trim(),
        type: dto.type ?? TaxType.VAT,
        rate,
        outputAccountId: await this.resolveConfiguredAccount(
          dto.outputAccountId,
          'thuế GTGT đầu ra',
        ),
        inputAccountId: await this.resolveConfiguredAccount(
          dto.inputAccountId,
          'thuế GTGT đầu vào',
        ),
        isActive: dto.isActive ?? true,
        description: dto.description?.trim() || null,
      }),
    );
  }

  async update(id: string, dto: UpdateTaxCodeDto): Promise<TaxCode> {
    const taxCode = await this.findById(id);

    if (dto.name !== undefined) {
      taxCode.name = dto.name.trim();
    }
    if (dto.rate !== undefined) {
      taxCode.rate = this.assertRate(dto.rate);
    }
    if (dto.outputAccountId !== undefined) {
      taxCode.outputAccountId = await this.resolveConfiguredAccount(
        dto.outputAccountId ?? undefined,
        'thuế GTGT đầu ra',
      );
    }
    if (dto.inputAccountId !== undefined) {
      taxCode.inputAccountId = await this.resolveConfiguredAccount(
        dto.inputAccountId ?? undefined,
        'thuế GTGT đầu vào',
      );
    }
    if (dto.isActive !== undefined) {
      taxCode.isActive = dto.isActive;
    }
    if (dto.description !== undefined) {
      taxCode.description = dto.description?.trim() || null;
    }

    return this.taxCodes.save(taxCode);
  }

  /**
   * Xóa mã thuế **chưa dùng**.
   *
   * Mã đã gắn vào dòng chứng từ thì không xóa — chỉ `isActive = false`. Xóa đi sẽ làm
   * mất khả năng giải thích vì sao một dòng có thuế suất đó.
   */
  async remove(id: string): Promise<void> {
    const taxCode = await this.findById(id);

    const usage = await this.usageCount(id);
    if (usage > 0) {
      throw new ConflictException(
        `Mã thuế "${taxCode.code}" đang được dùng ở ${usage} dòng chứng từ — hãy ngừng sử dụng thay vì xóa`,
      );
    }

    await this.taxCodes.remove(taxCode);
  }

  /** Số dòng chứng từ (hóa đơn bán + hóa đơn mua) đang tham chiếu mã thuế này. */
  async usageCount(id: string): Promise<number> {
    const rows = await this.dataSource.query<{ count: string }[]>(
      `SELECT (
         (SELECT COUNT(*) FROM sales_invoice_lines WHERE tax_code_id = $1) +
         (SELECT COUNT(*) FROM vendor_bill_lines WHERE tax_code_id = $1)
       )::text AS count`,
      [id],
    );
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Thuế suất áp cho một dòng chứng từ — **sao lại** vào dòng.
   *
   * `null` ⇒ dòng không chịu thuế (thuế suất 0). Trả về cả `taxCode` (mã dạng chữ) để
   * báo cáo đọc được mà không phải join lại bảng danh mục.
   */
  async resolveLineTax(
    taxCodeId: string | null | undefined,
  ): Promise<ResolvedLineTax> {
    if (!taxCodeId) {
      return { taxCodeId: null, taxCode: null, taxRate: '0.0000' };
    }

    const taxCode = await this.findById(taxCodeId);
    if (!taxCode.isActive) {
      throw new BadRequestException(
        `Mã thuế "${taxCode.code}" đã ngừng sử dụng — không áp được cho chứng từ mới`,
      );
    }

    return {
      taxCodeId: taxCode.id,
      taxCode: taxCode.code,
      taxRate: taxRateToString(taxCode.rate),
    };
  }

  /**
   * Tài khoản thuế để ghi sổ (mục 10.C.2).
   *
   * Ưu tiên tài khoản khai trên mã thuế; chưa khai thì rơi về tiền tố TT200
   * (`3331` đầu ra / `1331` đầu vào). **Luôn** trả về tài khoản **lá, đang hoạt động**
   * — nơi gọi không phải kiểm lại.
   */
  async resolveVatAccount(
    taxCode: TaxCode | null,
    direction: TaxDirection,
  ): Promise<Account> {
    const configured =
      direction === 'output'
        ? taxCode?.outputAccountId
        : taxCode?.inputAccountId;

    if (configured) {
      return this.accounts.getPostable(configured);
    }

    const prefix =
      direction === 'output'
        ? VAT_OUTPUT_ACCOUNT_PREFIX
        : VAT_INPUT_ACCOUNT_PREFIX;

    return this.accounts.requirePostableByCodePrefix(
      prefix,
      direction === 'output'
        ? `thuế GTGT đầu ra (${prefix}*)`
        : `thuế GTGT đầu vào (${prefix}*)`,
    );
  }

  /**
   * Tài khoản thuế để ghi sổ khi **chỉ có `taxCodeId`** trên dòng chứng từ.
   *
   * Dùng ở đường `post`: lúc đó ta có dòng chứng từ (đã sao thuế suất) chứ không có
   * sẵn thực thể `TaxCode`, nên cần một cửa vào nhận id. `taxCodeId = null` vẫn hợp lệ
   * (dòng không chịu thuế) và rơi về tiền tố mặc định — nhưng nơi gọi **phải** kiểm
   * `taxAmount > 0` trước, vì dòng không thuế không sinh bút toán thuế nào.
   */
  async resolveVatAccountById(
    taxCodeId: string | null,
    direction: TaxDirection,
  ): Promise<Account> {
    const taxCode = taxCodeId ? await this.findById(taxCodeId) : null;
    return this.resolveVatAccount(taxCode, direction);
  }

  /**
   * Giải thuế cho **toàn bộ dòng** của một chứng từ (mục 10.C.2).
   *
   * Trả về thuế suất **sao lại** cho từng dòng cùng **tổng thuế của chứng từ**. Đây là
   * nguồn sự thật duy nhất cho "thuế của chứng từ này là bao nhiêu": hóa đơn bán và hóa
   * đơn mua đều đi qua đây nên quy tắc làm tròn không bị chép lại hai nơi.
   *
   * Nếu người lập có khai `declaredTax` trên đầu chứng từ thì nó **phải** khớp tổng các
   * dòng. Không tự sửa cho khớp: một con số lệch nghĩa là dữ liệu vào sai, và ghi sổ
   * theo số tự sửa sẽ tạo bút toán cân bằng nhưng **sai** — loại lỗi không bất biến nào
   * bắt được.
   */
  async resolveDocumentTaxes(
    lines: readonly TaxableLineInput[],
    declaredTax: string | undefined,
    documentLabel: string,
  ): Promise<{ lines: ResolvedLineTaxAmount[]; headerTax: Decimal }> {
    const resolved: ResolvedLineTaxAmount[] = [];
    for (const line of lines) {
      const tax = await this.resolveLineTax(line.taxCodeId);
      resolved.push({
        taxCodeId: tax.taxCodeId,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        taxAmount: computeTaxAmount(line.amount, tax.taxRate),
      });
    }

    const lineTotal = sumMoney(resolved.map((line) => line.taxAmount));
    if (declaredTax === undefined) {
      return { lines: resolved, headerTax: lineTotal };
    }

    const declared = toMoney(declaredTax);
    if (!declared.equals(lineTotal)) {
      throw new BadRequestException(
        `Thuế trên đầu ${documentLabel} (${moneyToString(declared)}) không khớp tổng thuế các dòng (${moneyToString(lineTotal)})`,
      );
    }
    return { lines: resolved, headerTax: declared };
  }

  /**
   * Gom tiền thuế của các dòng theo **tài khoản thuế đích** để sinh dòng bút toán.
   *
   * Vì sao gom theo **tài khoản** chứ không theo mã thuế: nếu doanh nghiệp tách chi
   * tiết (33311/33312) thì mỗi tài khoản phải là một dòng riêng cho khớp sổ cái; còn
   * hai mã thuế cùng trỏ về 3331 thì chỉ nên là **một** dòng, nếu không bút toán sẽ
   * thừa dòng mà tổng vẫn đúng — khó đối chiếu về sau.
   *
   * Chỉ trả về nhóm có tiền thuế **khác 0**; dòng không chịu thuế không sinh bút toán.
   */
  async groupVatByAccount(
    lines: readonly { taxAmount: string; taxCodeId: string | null }[],
    direction: TaxDirection,
  ): Promise<VatAccountGroup[]> {
    const buckets = new Map<string, Decimal>();

    for (const line of lines) {
      const amount = toMoney(line.taxAmount);
      if (amount.isZero()) continue;
      const account = await this.resolveVatAccountById(
        line.taxCodeId,
        direction,
      );
      buckets.set(account.id, (buckets.get(account.id) ?? new Decimal(0)).plus(amount));
    }

    return [...buckets.entries()].map(([accountId, amount]) => ({
      accountId,
      amount: moneyToString(amount),
    }));
  }

  /** Kiểm tra thuế suất hợp lệ và chuẩn hóa về 4 chữ số thập phân. */
  private assertRate(rate: string): string {
    const parsed = toMoney(rate);
    if (!isTaxRateInRange(parsed)) {
      throw new BadRequestException(
        `Thuế suất phải nằm trong khoảng 0–${MAX_TAX_RATE_PERCENT.toString()}% (đã nhận ${rate})`,
      );
    }
    return taxRateToString(parsed);
  }

  /**
   * Tài khoản cấu hình trên mã thuế phải là tài khoản lá đang hoạt động.
   *
   * Bọc lại lỗi của `AccountsService.getPostable` để nói rõ **đang khai tài khoản nào**
   * (đầu ra hay đầu vào) — nếu không, người dùng chỉ thấy "tài khoản là tổng hợp" mà
   * không biết ô nào trên form đang sai.
   */
  private async resolveConfiguredAccount(
    accountId: string | undefined,
    label: string,
  ): Promise<string | null> {
    if (!accountId) {
      return null;
    }
    try {
      const account = await this.accounts.getPostable(accountId);
      return account.id;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException(
          `Tài khoản ${label} không hợp lệ: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Nhãn loại thuế — dùng cho thông báo/báo cáo. */
  labelOf(type: TaxType): string {
    return TAX_TYPE_LABELS[type];
  }
}
