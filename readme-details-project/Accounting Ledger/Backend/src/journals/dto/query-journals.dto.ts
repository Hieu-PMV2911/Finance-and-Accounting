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

import { JournalStatus } from '../../common/enums/journal-status.enum.js';

export class QueryJournalsDto {
  @ApiPropertyOptional({ enum: JournalStatus })
  @IsOptional()
  @IsEnum(JournalStatus, { message: 'Trạng thái bút toán không hợp lệ' })
  status?: JournalStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'periodId không hợp lệ' })
  periodId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Lọc bút toán có dòng chạm tài khoản này' })
  @IsOptional()
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate phải theo định dạng YYYY-MM-DD',
  })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate phải theo định dạng YYYY-MM-DD',
  })
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số hiệu / diễn giải / số chứng từ' })
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
