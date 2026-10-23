import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { CURRENCY_CODE_PATTERN } from '../../common/utils/currency.util.js';

const CURRENCY_MESSAGE =
  'Đơn vị tiền hạch toán phải là mã ISO 4217 gồm đúng 3 chữ cái in hoa (vd: VND, USD)';

/** Sửa công ty — trường nào không gửi thì giữ nguyên. */
export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã công ty tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã công ty chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxCode?: string | null;

  @ApiPropertyOptional({
    example: 'VND',
    description:
      'Đổi đơn vị tiền hạch toán KHÔNG quy đổi lại dữ liệu đã ghi sổ — mọi giá trị Nợ/Có cũ vẫn mang nghĩa theo đơn vị cũ.',
  })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, { message: CURRENCY_MESSAGE })
  baseCurrency?: string;

  @ApiPropertyOptional({
    description:
      'Đặt công ty này làm mặc định (bỏ cờ mặc định của công ty khác). Không thể bỏ cờ mặc định mà không chọn công ty thay thế.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Ngừng sử dụng công ty (không áp dụng cho công ty mặc định)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
