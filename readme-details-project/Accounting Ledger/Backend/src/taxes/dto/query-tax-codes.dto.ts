import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { TaxType } from '../../common/enums/tax-code.enum.js';

export class QueryTaxCodesDto {
  @ApiPropertyOptional({ enum: TaxType })
  @IsOptional()
  @IsEnum(TaxType, { message: 'Loại thuế không hợp lệ' })
  type?: TaxType;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái đang dùng' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'isActive phải là true/false' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Tìm theo mã / tên' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
