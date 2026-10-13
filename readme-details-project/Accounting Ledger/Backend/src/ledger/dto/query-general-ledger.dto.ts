import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Truy vấn sổ cái chi tiết của một tài khoản.
 *
 * Phạm vi ngày xác định theo **một trong hai cách**:
 * - `periodId`: lấy đúng khoảng ngày của kỳ kế toán đó, hoặc
 * - `fromDate` + `toDate`: khoảng ngày tùy ý (`YYYY-MM-DD`).
 */
export class QueryGeneralLedgerDto {
  @ApiProperty({ format: 'uuid', description: 'Tài khoản cần xem sổ cái' })
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Kỳ kế toán (thay cho fromDate/toDate)' })
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

  @ApiPropertyOptional({ default: 500, maximum: 2000, description: 'Số dòng phát sinh tối đa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000, { message: 'limit tối đa 2000' })
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
