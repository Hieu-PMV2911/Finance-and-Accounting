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

export class CreateSalesInvoiceLineDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tài khoản doanh thu — CHỈ gửi khi muốn ghi đè luật mặc định (cần quyền admin/poster). Bỏ trống để hệ thống tự chọn theo luật mặc định tài khoản.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId?: string;

  @ApiPropertyOptional({
    example: 'dịch vụ tư vấn',
    description:
      'Loại hàng hóa/dịch vụ dùng để tra luật mặc định tài khoản (mục 10.A). Bỏ trống ⇒ dùng luật "*".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Loại hàng hóa/dịch vụ tối đa 64 ký tự' })
  category?: string;

  @ApiPropertyOptional({ example: 'Bán hàng dịch vụ' })
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

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Mã thuế áp cho dòng (mục 10.C.2). Bỏ trống ⇒ dòng không chịu thuế. Thuế suất được SAO LẠI vào dòng khi lập, nên sửa mã thuế sau này không làm đổi hóa đơn cũ.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'taxCodeId không hợp lệ' })
  taxCodeId?: string;
}

export class CreateSalesInvoiceDto {
  @ApiProperty({ example: 'HD-2026-001', description: 'Số hóa đơn' })
  @IsString()
  @MaxLength(64, { message: 'Số hóa đơn tối đa 64 ký tự' })
  invoiceNo: string;

  @ApiProperty({ format: 'uuid', description: 'Khách hàng (party)' })
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId: string;

  @ApiProperty({ example: '2026-10-12', description: 'Ngày hóa đơn (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: '2026-10-27', description: 'Ngày đến hạn' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Hóa đơn dịch vụ tư vấn' })
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Tài khoản phải thu mặc định cho hóa đơn' })
  @IsOptional()
  @IsUUID('4', { message: 'receivableAccountId không hợp lệ' })
  receivableAccountId?: string;

  @ApiProperty({ type: [CreateSalesInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải có ít nhất 1 dòng hóa đơn' })
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceLineDto)
  lines: CreateSalesInvoiceLineDto[];
}
