import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { AccountType } from '../../common/enums/account-type.enum.js';

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: '1111' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã tài khoản tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã tài khoản chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'Tiền mặt Việt Nam Đồng' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Tên tài khoản tối đa 255 ký tự' })
  name?: string;

  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType, { message: 'Loại tài khoản không hợp lệ' })
  type?: AccountType;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Chuyển sang tài khoản cha khác; null để đưa về gốc',
  })
  @IsOptional()
  @IsUUID('4', { message: 'parentId không hợp lệ' })
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Mô tả tối đa 1000 ký tự' })
  description?: string | null;
}
