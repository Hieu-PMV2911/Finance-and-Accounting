import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

export class CreateVendorBillLineDto {
  @ApiProperty({ format: 'uuid', description: 'Tài khoản chi phí/hàng hóa (theo cấu hình/quy tắc kế toán)' })
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId: string;

  @ApiPropertyOptional({ example: 'Mua dịch vụ' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải dòng tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({ example: '1.0000' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  quantity?: string;

  @ApiPropertyOptional({ example: '1500000.0000' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  unitPrice?: string;

  @ApiProperty({ example: '1500000.0000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  amount: string;
}

export class CreateVendorBillDto {
  @ApiProperty({ example: 'HDM-2026-001', description: 'Số hóa đơn mua' })
  @IsString()
  @MaxLength(64, { message: 'Số hóa đơn tối đa 64 ký tự' })
  billNo: string;

  @ApiProperty({ format: 'uuid', description: 'Nhà cung cấp (party)' })
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId: string;

  @ApiProperty({ example: '2026-10-12', description: 'Ngày hóa đơn (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: '2026-10-27', description: 'Ngày đến hạn' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Hóa đơn mua dịch vụ' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({ example: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @ApiProperty({ example: '0.0000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  subtotal: string;

  @ApiPropertyOptional({ example: '0.0000' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  taxAmount?: string;

  @ApiProperty({ example: '1500000.0000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  total: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Tài khoản phải trả mặc định cho hóa đơn mua' })
  @IsOptional()
  @IsUUID('4', { message: 'payableAccountId không hợp lệ' })
  payableAccountId?: string;

  @ApiProperty({ type: [CreateVendorBillLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải có ít nhất 1 dòng hóa đơn mua' })
  @ValidateNested({ each: true })
  @Type(() => CreateVendorBillLineDto)
  lines: CreateVendorBillLineDto[];
}
