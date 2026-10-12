import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { AccountType } from '../../common/enums/account-type.enum.js';

export class QueryAccountsDto {
  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType, { message: 'Loại tài khoản không hợp lệ' })
  type?: AccountType;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái hoạt động' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'isActive phải là true/false' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên tài khoản' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Lọc con trực tiếp của một tài khoản' })
  @IsOptional()
  @IsUUID('4', { message: 'parentId không hợp lệ' })
  parentId?: string;
}
