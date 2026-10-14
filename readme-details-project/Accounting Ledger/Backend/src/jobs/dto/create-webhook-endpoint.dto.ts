import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
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

/** Đăng ký một endpoint nhận webhook. */
export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'Hệ thống thanh toán' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'https://payments.example.com/hooks/ledger' })
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'url phải là http(s) hợp lệ' },
  )
  @MaxLength(500)
  url: string;

  @ApiPropertyOptional({
    description: 'Khóa ký HMAC-SHA256. Bỏ trống sẽ tự sinh.',
    minLength: 16,
  })
  @IsOptional()
  @IsString()
  @MinLength(16, { message: 'secret tối thiểu 16 ký tự' })
  @MaxLength(200)
  secret?: string;

  @ApiPropertyOptional({
    enum: WebhookEventType,
    isArray: true,
    description: 'Danh sách sự kiện đăng ký; bỏ trống = nhận mọi sự kiện',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'events không được là mảng rỗng' })
  @IsEnum(WebhookEventType, {
    each: true,
    message: 'events chứa sự kiện không hợp lệ',
  })
  events?: WebhookEventType[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
