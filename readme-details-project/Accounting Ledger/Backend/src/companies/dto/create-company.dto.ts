import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateCompanyDto {
  @ApiProperty({ example: 'MAIN', description: 'Mã công ty (duy nhất)' })
  @IsString()
  @MaxLength(32, { message: 'Mã công ty tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã công ty chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code: string;

  @ApiProperty({ example: 'Công ty TNHH Dịch vụ Kế toán An Phát' })
  @IsString()
  @MaxLength(255, { message: 'Tên công ty tối đa 255 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: '0312345678' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã số thuế tối đa 32 ký tự' })
  taxCode?: string;

  @ApiPropertyOptional({
    example: 'VND',
    default: 'VND',
    description:
      'Đơn vị tiền hạch toán. Mọi giá trị Nợ/Có trong sổ cái đều tính bằng đơn vị này; ngoại tệ lưu riêng trên dòng.',
  })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, { message: CURRENCY_MESSAGE })
  baseCurrency?: string;

  @ApiPropertyOptional({
    description:
      'Đặt làm công ty mặc định. Công ty đầu tiên của hệ thống luôn tự động là mặc định.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Pháp nhân chính tại TP.HCM' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description?: string;
}
