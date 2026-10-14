import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

import { WebhookEventType } from '../enums/webhook.enum.js';

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'url phải là http(s) hợp lệ' },
  )
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({ description: 'Đổi khóa ký HMAC-SHA256' })
  @IsOptional()
  @IsString()
  @MinLength(16, { message: 'secret tối thiểu 16 ký tự' })
  @MaxLength(200)
  secret?: string;

  @ApiPropertyOptional({ enum: WebhookEventType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(WebhookEventType, {
    each: true,
    message: 'events chứa sự kiện không hợp lệ',
  })
  events?: WebhookEventType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
