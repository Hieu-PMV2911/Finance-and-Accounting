import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { JobQueue, JobRunStatus, JobTrigger } from '../enums/job.enum.js';

/** Lọc lịch sử chạy job (mục 9). */
export class QueryJobRunsDto {
  @ApiPropertyOptional({ enum: JobQueue })
  @IsOptional()
  @IsEnum(JobQueue, { message: 'queue không hợp lệ' })
  queue?: JobQueue;

  @ApiPropertyOptional({ enum: JobRunStatus })
  @IsOptional()
  @IsEnum(JobRunStatus, { message: 'status không hợp lệ' })
  status?: JobRunStatus;

  @ApiPropertyOptional({ enum: JobTrigger })
  @IsOptional()
  @IsEnum(JobTrigger, { message: 'trigger không hợp lệ' })
  trigger?: JobTrigger;

  @ApiPropertyOptional({ description: 'Tên job (vd `integrity-check`)' })
  @IsOptional()
  @IsString()
  jobName?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Người kích hoạt' })
  @IsOptional()
  @IsUUID('4', { message: 'triggeredBy không hợp lệ' })
  triggeredBy?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200, { message: 'limit tối đa 200' })
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
