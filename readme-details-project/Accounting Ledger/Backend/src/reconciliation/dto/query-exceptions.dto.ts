import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import {
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '../../common/enums/reconciliation-exception.enum.js';

/** Lọc danh sách giao dịch lệch (mục 10.B). */
export class QueryExceptionsDto {
  @ApiPropertyOptional({ enum: ReconciliationExceptionStatus })
  @IsOptional()
  @IsEnum(ReconciliationExceptionStatus)
  status?: ReconciliationExceptionStatus;

  @ApiPropertyOptional({ enum: ReconciliationExceptionType })
  @IsOptional()
  @IsEnum(ReconciliationExceptionType)
  type?: ReconciliationExceptionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  statementId?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
