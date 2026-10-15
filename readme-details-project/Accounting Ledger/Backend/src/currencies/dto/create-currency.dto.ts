import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CURRENCY_CODE_PATTERN } from '../../common/utils/currency.util.js';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'USD', description: 'Mã ISO 4217 — 3 chữ cái in hoa' })
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, {
    message: 'Mã tiền phải là mã ISO 4217 gồm đúng 3 chữ cái in hoa (vd: VND, USD)',
  })
  code: string;

  @ApiProperty({ example: 'Đô la Mỹ' })
  @IsString()
  @MaxLength(128, { message: 'Tên loại tiền tối đa 128 ký tự' })
  name: string;

  @ApiPropertyOptional({
    default: 2,
    description: 'Số chữ số thập phân của ngoại tệ (VND: 0, USD: 2)',
  })
  @IsOptional()
  @IsInt({ message: 'Số chữ số thập phân phải là số nguyên' })
  @Min(0)
  @Max(4, { message: 'Số chữ số thập phân tối đa 4' })
  decimals?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
