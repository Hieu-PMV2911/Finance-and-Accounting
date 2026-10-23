import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Company } from './entities/company.entity.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';
import type { UpdateCompanyDto } from './dto/update-company.dto.js';

/** Đơn vị tiền hạch toán mặc định khi hệ thống chưa cấu hình công ty nào. */
export const DEFAULT_BASE_CURRENCY = 'VND';

/** Mã công ty mặc định được tạo tự động ở lần seed đầu tiên. */
export const DEFAULT_COMPANY_CODE = 'MAIN';

/**
 * Công ty / pháp nhân (mục 10.C).
 *
 * Ở 10.C.1, vai trò thật của service này là trả lời **một câu hỏi duy nhất**:
 * *"đơn vị tiền hạch toán là gì?"*. Mọi phép quy đổi ngoại tệ đều hỏi qua
 * `baseCurrency()`, không nơi nào hardcode `'VND'`.
 *
 * Vì sao vẫn cho phép CRUD đầy đủ ngay từ bây giờ: công ty là **dữ liệu cấu hình**,
 * và 10.C.3 sẽ chỉ thêm chiều cách ly dữ liệu lên trên cấu trúc này — không phải
 * dựng lại. Làm sớm thì 10.C.3 chỉ là chuyện thêm `company_id` và bộ lọc.
 */
@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  async list(includeInactive = false): Promise<Company[]> {
    return this.companies.find({
      where: includeInactive ? {} : { isActive: true },
      order: { isDefault: 'DESC', code: 'ASC' },
    });
  }

  async findById(id: string): Promise<Company> {
    const company = await this.companies.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Không tìm thấy công ty');
    }
    return company;
  }

  /**
   * Công ty mặc định — nơi mọi thao tác chưa chọn công ty sẽ trỏ về.
   *
   * Trả `null` khi hệ thống chưa có công ty nào (cài đặt mới, chưa chạy seed):
   * đây **không** phải lỗi, vì `baseCurrency()` vẫn trả được giá trị mặc định.
   */
  async findDefault(): Promise<Company | null> {
    return this.companies.findOne({
      where: { isDefault: true },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Đơn vị tiền hạch toán đang dùng (quyết định #3).
   *
   * Thứ tự giải: công ty mặc định → công ty đang hoạt động đầu tiên → `VND`.
   * Nhánh cuối cùng khiến hệ thống chạy được **trước cả khi cấu hình công ty**,
   * đúng tinh thần "lưới an toàn" của `AccountDefaultsService`.
   */
  async baseCurrency(): Promise<string> {
    const company = await this.findDefault();
    if (company) {
      return company.baseCurrency.toUpperCase();
    }

    const fallback = await this.companies.findOne({
      where: { isActive: true },
      order: { code: 'ASC' },
    });
    return fallback
      ? fallback.baseCurrency.toUpperCase()
      : DEFAULT_BASE_CURRENCY;
  }

  async create(dto: CreateCompanyDto): Promise<Company> {
    const code = dto.code.trim().toUpperCase();
    await this.assertCodeAvailable(code);

    const baseCurrency = (dto.baseCurrency ?? DEFAULT_BASE_CURRENCY)
      .trim()
      .toUpperCase();

    // Công ty đầu tiên của hệ thống tự động là công ty mặc định — nếu không,
    // `baseCurrency()` sẽ rơi vào nhánh dự phòng và người dùng khó hiểu vì sao
    // công ty vừa tạo không được dùng.
    const existingCount = await this.companies.count();
    const isDefault = dto.isDefault ?? existingCount === 0;

    if (isDefault) {
      await this.clearDefault();
    }

    return this.companies.save(
      this.companies.create({
        code,
        name: dto.name.trim(),
        taxCode: dto.taxCode?.trim() || null,
        baseCurrency,
        isDefault,
        isActive: dto.isActive ?? true,
        description: dto.description?.trim() || null,
      }),
    );
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findById(id);

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      await this.assertCodeAvailable(code, id);
      company.code = code;
    }
    if (dto.name !== undefined) {
      company.name = dto.name.trim();
    }
    if (dto.taxCode !== undefined) {
      company.taxCode = dto.taxCode?.trim() || null;
    }
    if (dto.baseCurrency !== undefined) {
      // Đổi đơn vị tiền hạch toán **không** quy đổi lại dữ liệu đã ghi sổ — mọi
      // `debit`/`credit` cũ vẫn mang nghĩa theo đơn vị cũ. Chặn khi đã có bút toán
      // là việc của 10.C.3 (khi có `company_id` để đếm chính xác); ở đây chỉ ghi
      // rõ cảnh báo để không ai tưởng là phép đổi này vô hại.
      company.baseCurrency = dto.baseCurrency.trim().toUpperCase();
    }
    if (dto.isActive !== undefined) {
      if (company.isDefault && dto.isActive === false) {
        throw new BadRequestException(
          'Không thể ngừng sử dụng công ty mặc định — hãy đặt công ty khác làm mặc định trước',
        );
      }
      company.isActive = dto.isActive;
    }
    if (dto.description !== undefined) {
      company.description = dto.description?.trim() || null;
    }
    if (dto.isDefault !== undefined) {
      if (dto.isDefault) {
        await this.clearDefault(id);
        company.isDefault = true;
        company.isActive = true;
      } else if (company.isDefault) {
        throw new BadRequestException(
          'Hệ thống phải luôn có một công ty mặc định — hãy chọn công ty khác làm mặc định thay vì bỏ cờ này',
        );
      }
    }

    return this.companies.save(company);
  }

  async remove(id: string): Promise<void> {
    const company = await this.findById(id);
    if (company.isDefault) {
      throw new BadRequestException(
        'Không thể xóa công ty mặc định — hãy đặt công ty khác làm mặc định trước',
      );
    }
    await this.companies.remove(company);
  }

  /** Bỏ cờ mặc định của mọi công ty (trừ `exceptId`) — bảo đảm chỉ một công ty mặc định. */
  private async clearDefault(exceptId?: string): Promise<void> {
    await this.companies.update(
      exceptId ? { isDefault: true, id: Not(exceptId) } : { isDefault: true },
      { isDefault: false },
    );
  }

  private async assertCodeAvailable(
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.companies.findOne({
      where: exceptId ? { code, id: Not(exceptId) } : { code },
    });
    if (existing) {
      throw new ConflictException(`Mã công ty "${code}" đã tồn tại`);
    }
  }
}
