import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { BankTransactionSource } from '../enums/bank-transaction.enum.js';

/**
 * Nạp một lô sao kê ngân hàng (mục 10.B — P2.2).
 *
 * `content` là **toàn bộ nội dung file** dạng chuỗi (CSV có dòng tiêu đề, hoặc
 * JSON mảng/object). Việc đọc file chạy trong job nền (`statements`) để request
 * không bị chặn — controller trả về `202` + job id ngay khi đã xếp hàng đợi.
 */
export class IngestStatementDto {
  @ApiProperty({ format: 'uuid', description: 'Tài khoản tiền (111/112)' })
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId: string;

  @ApiPropertyOptional({
    enum: BankTransactionSource,
    default: BankTransactionSource.FILE,
    description:
      'Nguồn nạp. `api` chỉ dùng khi đã nối adapter API ngân hàng (hiện khung rỗng, chỉ `file` hoạt động).',
  })
  @IsOptional()
  @IsEnum(BankTransactionSource, { message: 'Nguồn sao kê không hợp lệ' })
  source?: BankTransactionSource;

  @ApiPropertyOptional({ description: 'Mã kỳ sao kê / tên file gốc' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceRef?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Ngày chốt sao kê (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'statementDate phải theo định dạng YYYY-MM-DD',
  })
  statementDate?: string;

  @ApiPropertyOptional({ example: '25000000.0000', description: 'Số dư đầu kỳ' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,4})?$/, {
    message: 'openingBalance phải là chuỗi số dương',
  })
  openingBalance?: string;

  @ApiPropertyOptional({ example: '31500000.0000', description: 'Số dư cuối kỳ' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,4})?$/, {
    message: 'closingBalance phải là chuỗi số dương',
  })
  closingBalance?: string;

  @ApiProperty({
    description:
      'Nội dung file sao kê: CSV (có dòng tiêu đề) hoặc JSON (mảng dòng / object chứa mảng).',
    example:
      'transaction_date,description,reference,amount,direction\n2026-10-12,Chuyen tien DH-2026-0912,DH-2026-0912,1500000.0000,in',
  })
  @IsString()
  content: string;
}
