import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

import { CURRENCY_CODE_PATTERN } from '../../common/utils/currency.util.js';

export class LookupExchangeRateDto {
  @ApiProperty({ example: 'USD', description: 'Mã tiền cần tra tỷ giá' })
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, {
    message: 'Mã tiền phải là mã ISO 4217 gồm đúng 3 chữ cái in hoa',
  })
  currency: string;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description:
      'Ngày cần tra (mặc định: hôm nay). Trả tỷ giá của ngày gần nhất KHÔNG muộn hơn ngày này — không nội suy.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'date phải theo định dạng YYYY-MM-DD' })
  date?: string;
}
