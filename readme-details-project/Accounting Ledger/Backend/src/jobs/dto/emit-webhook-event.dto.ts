import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { WebhookEventType } from '../enums/webhook.enum.js';

/**
 * Phát một sự kiện ra các endpoint đã đăng ký (mục 9).
 *
 * Dùng để tích hợp/kiểm thử: chọn sự kiện, dữ liệu kèm theo và (tùy chọn) giới
 * hạn chỉ gửi tới vài endpoint.
 */
export class EmitWebhookEventDto {
  @ApiProperty({ enum: WebhookEventType })
  @IsEnum(WebhookEventType, { message: 'eventType không hợp lệ' })
  eventType: WebhookEventType;

  @ApiPropertyOptional({
    description: 'Mã đối tượng nghiệp vụ để chống giao trùng (vd mã hóa đơn)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resourceRef?: string;

  @ApiPropertyOptional({ description: 'Dữ liệu kèm theo sự kiện' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    format: 'uuid',
    isArray: true,
    description: 'Chỉ gửi tới các endpoint này (bỏ trống = mọi endpoint đăng ký sự kiện)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'endpointIds phải là danh sách uuid' })
  endpointIds?: string[];
}
