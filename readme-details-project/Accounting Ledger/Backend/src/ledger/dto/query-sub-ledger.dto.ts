import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Truy vấn sổ cái phụ của **một đối tượng** (mục 10.0). */
export class QuerySubLedgerDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Đối tượng (khách hàng / nhà cung cấp)',
  })
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chỉ xem một tài khoản công nợ (vd tài khoản 131 hoặc 331). Bỏ trống = mọi tài khoản công nợ của đối tượng.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Phạm vi theo kỳ kế toán' })
  @IsOptional()
  @IsUUID('4', { message: 'periodId không hợp lệ' })
  periodId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate phải theo định dạng YYYY-MM-DD',
  })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate phải theo định dạng YYYY-MM-DD',
  })
  toDate?: string;

  @ApiPropertyOptional({ default: 500, maximum: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
