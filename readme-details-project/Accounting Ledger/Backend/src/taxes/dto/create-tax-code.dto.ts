import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { TaxType } from '../../common/enums/tax-code.enum.js';
import { TAX_RATE_PATTERN } from '../../common/utils/tax.util.js';

const TAX_RATE_MESSAGE =
  'Thuế suất phải là chuỗi số phần trăm (tối đa 5 chữ số nguyên, tối đa 4 chữ số thập phân; vd "10" = 10%)';

export class CreateTaxCodeDto {
  @ApiProperty({ example: 'VAT10', description: 'Mã thuế (duy nhất)' })
  @IsString()
  @MaxLength(32, { message: 'Mã thuế tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã thuế chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code: string;

  @ApiProperty({ example: 'Thuế GTGT 10%' })
  @IsString()
  @MaxLength(255, { message: 'Tên mã thuế tối đa 255 ký tự' })
  name: string;

  @ApiPropertyOptional({ enum: TaxType, default: TaxType.VAT })
  @IsOptional()
  @IsEnum(TaxType, { message: 'Loại thuế không hợp lệ' })
  type?: TaxType;

  @ApiProperty({
    example: '10',
    description: 'Thuế suất phần trăm (0–100). "10" = 10%.',
  })
  @IsString()
  @Matches(TAX_RATE_PATTERN, { message: TAX_RATE_MESSAGE })
  rate: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tài khoản thuế đầu ra (bán hàng). Bỏ trống ⇒ dùng tiền tố 3331.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'outputAccountId không hợp lệ' })
  outputAccountId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tài khoản thuế đầu vào (mua hàng). Bỏ trống ⇒ dùng tiền tố 1331.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'inputAccountId không hợp lệ' })
  inputAccountId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Áp dụng cho dịch vụ tư vấn' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description?: string;
}
