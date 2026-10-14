import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreatePartyDto {
  @ApiProperty({ example: 'KH001', description: 'Mã đối tượng (duy nhất)' })
  @IsString()
  @MaxLength(32, { message: 'Mã đối tượng tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã đối tượng chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code: string;

  @ApiProperty({ enum: PartyType, example: PartyType.CUSTOMER })
  @IsEnum(PartyType, { message: 'Loại đối tượng không hợp lệ' })
  type: PartyType;

  @ApiProperty({ example: 'Công ty TNHH Bán Lẻ An Phát' })
  @IsString()
  @MaxLength(255, { message: 'Tên đối tượng tối đa 255 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: '0312345678' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã số thuế tối đa 32 ký tự' })
  taxCode?: string;

  @ApiPropertyOptional({ example: '12 Lê Lợi, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  address?: string;

  @ApiPropertyOptional({ example: 'Trần Thị B' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'ketoan@anphat.vn' })
  @IsOptional()
  @IsEmail({}, { message: 'Email liên hệ không hợp lệ' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    default: 30,
    description: 'Số ngày được nợ (dùng để tính hạn thanh toán và tuổi nợ)',
  })
  @IsOptional()
  @IsInt({ message: 'Số ngày được nợ phải là số nguyên' })
  @Min(0, { message: 'Số ngày được nợ không được âm' })
  @Max(3650, { message: 'Số ngày được nợ tối đa 3650' })
  paymentTermDays?: number;

  @ApiPropertyOptional({
    example: '100000000.0000',
    description: 'Hạn mức công nợ (chuỗi số, bỏ trống = không giới hạn)',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, {
    message:
      'Hạn mức công nợ phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân)',
  })
  creditLimit?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Khách hàng bán lẻ khu vực miền Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description?: string;
}
