import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/**
 * Truy vấn bảng cân đối số phát sinh.
 * Cần `periodId` **hoặc** cả `fromDate` và `toDate`.
 */
export class QueryTrialBalanceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'periodId không hợp lệ' })
  periodId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate phải theo định dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate phải theo định dạng YYYY-MM-DD' })
  toDate?: string;
}
