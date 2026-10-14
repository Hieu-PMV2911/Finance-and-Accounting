import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PartyType } from '../../common/enums/party-type.enum.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

/** Sửa đối tượng — trường nào không gửi thì giữ nguyên. */
export class UpdatePartyDto {
  @ApiPropertyOptional({ example: 'KH001' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã đối tượng tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã đối tượng chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code?: string;

  @ApiPropertyOptional({ enum: PartyType })
  @IsOptional()
  @IsEnum(PartyType, { message: 'Loại đối tượng không hợp lệ' })
  type?: PartyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'Email liên hệ không hợp lệ' })
  @MaxLength(255)
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'Số ngày được nợ phải là số nguyên' })
  @Min(0)
  @Max(3650)
  paymentTermDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'Hạn mức công nợ phải là chuỗi số (tối đa 4 chữ số thập phân)',
  })
  creditLimit?: string | null;

  @ApiPropertyOptional({
    description:
      'Ngừng sử dụng thay vì xóa — đối tượng đã phát sinh bút toán thì không xóa được',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
