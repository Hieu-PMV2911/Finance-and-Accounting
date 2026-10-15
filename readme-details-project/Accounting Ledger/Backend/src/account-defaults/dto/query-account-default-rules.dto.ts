import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { AccountDefaultScope } from '../../common/enums/account-default-scope.enum.js';

export class QueryAccountDefaultRulesDto {
  @ApiPropertyOptional({ enum: AccountDefaultScope })
  @IsOptional()
  @IsEnum(AccountDefaultScope, { message: 'Phạm vi luật không hợp lệ' })
  scope?: AccountDefaultScope;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái đang áp dụng' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'isActive phải là true/false' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Tìm theo loại hàng hóa/dịch vụ' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;
}
