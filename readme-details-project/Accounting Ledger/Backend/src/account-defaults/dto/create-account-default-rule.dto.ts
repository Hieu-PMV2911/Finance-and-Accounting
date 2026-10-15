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

import {
  AccountDefaultScope,
  ANY_CATEGORY,
} from '../../common/enums/account-default-scope.enum.js';

export class CreateAccountDefaultRuleDto {
  @ApiProperty({
    enum: AccountDefaultScope,
    example: AccountDefaultScope.SALES,
    description: 'Bán hàng (doanh thu) hay mua hàng (chi phí)',
  })
  @IsEnum(AccountDefaultScope, { message: 'Phạm vi luật không hợp lệ' })
  scope: AccountDefaultScope;

  @ApiProperty({
    example: 'dịch vụ tư vấn',
    description: `Loại hàng hóa/dịch vụ. Dùng "${ANY_CATEGORY}" để áp dụng cho mọi loại.`,
  })
  @IsString()
  @MaxLength(64, { message: 'Loại hàng hóa/dịch vụ tối đa 64 ký tự' })
  @Matches(/\S/, { message: 'Loại hàng hóa/dịch vụ không được để trống' })
  category: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Tài khoản đích — phải là tài khoản lá đang hoạt động',
  })
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId: string;

  @ApiPropertyOptional({ example: 'Doanh thu dịch vụ tư vấn' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true/false' })
  isActive?: boolean;
}
