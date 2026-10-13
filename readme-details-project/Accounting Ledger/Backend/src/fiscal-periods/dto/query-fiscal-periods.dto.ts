import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { FiscalPeriodStatus } from '../../common/enums/fiscal-period-status.enum.js';

export class QueryFiscalPeriodsDto {
  @ApiPropertyOptional({ enum: FiscalPeriodStatus })
  @IsOptional()
  @IsEnum(FiscalPeriodStatus, { message: 'Trạng thái kỳ không hợp lệ' })
  status?: FiscalPeriodStatus;

  @ApiPropertyOptional({ example: 2026, description: 'Lọc kỳ giao với năm này' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'year phải là số nguyên' })
  @Min(1900)
  @Max(9999)
  year?: number;

  @ApiPropertyOptional({
    example: '2026-01-15',
    description: 'Lọc kỳ chứa ngày này (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên kỳ' })
  @IsOptional()
  @IsString()
  search?: string;
}
