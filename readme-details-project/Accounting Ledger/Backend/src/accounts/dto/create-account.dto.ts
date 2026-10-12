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

import { AccountType } from '../../common/enums/account-type.enum.js';

export class CreateAccountDto {
  @ApiProperty({ example: '1111', description: 'Mã tài khoản (duy nhất)' })
  @IsString()
  @MaxLength(32, { message: 'Mã tài khoản tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã tài khoản chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code: string;

  @ApiProperty({ example: 'Tiền mặt Việt Nam Đồng' })
  @IsString()
  @MaxLength(255, { message: 'Tên tài khoản tối đa 255 ký tự' })
  name: string;

  @ApiProperty({ enum: AccountType, example: AccountType.ASSET })
  @IsEnum(AccountType, { message: 'Loại tài khoản không hợp lệ' })
  type: AccountType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Tài khoản cha (bỏ trống nếu là tài khoản gốc)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'parentId không hợp lệ' })
  parentId?: string;

  @ApiPropertyOptional({ default: true, description: 'Cho phép ghi sổ trực tiếp' })
  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Tiền mặt tại quỹ' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Mô tả tối đa 1000 ký tự' })
  description?: string;
}
