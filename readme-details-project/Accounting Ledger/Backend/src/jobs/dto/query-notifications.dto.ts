import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
} from '../enums/notification.enum.js';

/** Lọc danh sách thông báo. */
export class QueryNotificationsDto {
  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType, { message: 'type không hợp lệ' })
  type?: NotificationType;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus, { message: 'status không hợp lệ' })
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: NotificationSeverity })
  @IsOptional()
  @IsEnum(NotificationSeverity, { message: 'severity không hợp lệ' })
  severity?: NotificationSeverity;

  @ApiPropertyOptional({ description: 'Tìm theo tiêu đề / nội dung' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

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
