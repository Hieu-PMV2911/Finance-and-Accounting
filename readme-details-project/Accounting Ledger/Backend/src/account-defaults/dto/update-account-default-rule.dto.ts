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

import {
  AccountDefaultScope,
  ANY_CATEGORY,
} from '../../common/enums/account-default-scope.enum.js';

/** Sửa luật mặc định tài khoản — trường nào không gửi thì giữ nguyên. */
export class UpdateAccountDefaultRuleDto {
  @ApiPropertyOptional({ enum: AccountDefaultScope })
  @IsOptional()
  @IsEnum(AccountDefaultScope, { message: 'Phạm vi luật không hợp lệ' })
  scope?: AccountDefaultScope;

  @ApiPropertyOptional({
    example: 'dịch vụ phần mềm',
    description: `Loại hàng hóa/dịch vụ; "${ANY_CATEGORY}" = mọi loại.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Loại hàng hóa/dịch vụ tối đa 64 ký tự' })
  @Matches(/\S/, { message: 'Loại hàng hóa/dịch vụ không được để trống' })
  category?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true/false' })
  isActive?: boolean;
}
