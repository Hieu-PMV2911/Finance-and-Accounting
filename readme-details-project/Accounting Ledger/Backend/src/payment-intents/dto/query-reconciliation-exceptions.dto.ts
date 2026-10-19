import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '../enums/reconciliation-exception.enum.js';

export class QueryReconciliationExceptionsDto {
  @ApiPropertyOptional({ enum: ReconciliationExceptionType })
  @IsOptional()
  @IsEnum(ReconciliationExceptionType, { message: 'Loại ngoại lệ không hợp lệ' })
  type?: ReconciliationExceptionType;

  @ApiPropertyOptional({ enum: ReconciliationExceptionStatus })
  @IsOptional()
  @IsEnum(ReconciliationExceptionStatus, { message: 'Trạng thái không hợp lệ' })
  status?: ReconciliationExceptionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'paymentIntentId không hợp lệ' })
  paymentIntentId?: string;

  @ApiPropertyOptional({ default: 100, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ResolveExceptionDto {
  @ApiPropertyOptional({
    example: 'Đã đối chiếu với sao kê ngân hàng ngày 12/10',
    description: 'Ghi chú xử lý — lưu vào vết để giải thích quyết định.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}
