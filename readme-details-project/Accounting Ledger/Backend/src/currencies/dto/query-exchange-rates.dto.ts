import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { CURRENCY_CODE_PATTERN } from '../../common/utils/currency.util.js';

export class QueryExchangeRatesDto {
  @ApiPropertyOptional({ example: 'USD', description: 'Lọc theo mã tiền' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, {
    message: 'Mã tiền phải là mã ISO 4217 gồm đúng 3 chữ cái in hoa',
  })
  currency?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'fromDate phải theo định dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'toDate phải theo định dạng YYYY-MM-DD' })
  toDate?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
