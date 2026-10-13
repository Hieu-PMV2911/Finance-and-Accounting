import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { AuditAction } from '../enums/audit-action.enum.js';

export class QueryAuditLogsDto {
  @ApiPropertyOptional({ example: 'journal_entries', description: 'Tên bảng dữ liệu' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity?: string;

  @ApiPropertyOptional({ description: 'Id bản ghi bị thay đổi' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Người thực hiện' })
  @IsOptional()
  @IsUUID('4', { message: 'actorId không hợp lệ' })
  actorId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction, { message: 'action không hợp lệ' })
  action?: AuditAction;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate phải theo định dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate phải theo định dạng YYYY-MM-DD' })
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm theo email người thao tác, bảng, id bản ghi hoặc đường dẫn' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500, { message: 'limit tối đa 500' })
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
