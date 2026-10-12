import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Role } from '../../common/enums/role.enum.js';

export class CreateUserDto {
  @ApiProperty({ example: 'ketoan@example.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  password: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({
    enum: Role,
    isArray: true,
    example: [Role.MAKER],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true, message: 'Vai trò không hợp lệ' })
  roles?: Role[];
}
