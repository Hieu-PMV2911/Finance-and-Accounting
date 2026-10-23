import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { CURRENCY_CODE_PATTERN } from '../../common/utils/currency.util.js';

/**
 * Chuỗi tỷ giá: tối đa 11 chữ số nguyên, tối đa 8 chữ số thập phân (khớp `NUMERIC(19,8)`).
 *
 * Vì sao **chuỗi** chứ không phải `number`: JSON.parse biến `0.00004231` thành số
 * thực nhị phân và có thể mất chữ số cuối. Tỷ giá nhân với số tiền lớn nên sai số
 * nhỏ ở đây thành sai số lớn ở bút toán.
 */
export const FX_RATE_PATTERN = /^\d{1,11}(\.\d{1,8})?$/;

const FX_RATE_MESSAGE =
  'Tỷ giá phải là chuỗi số (tối đa 11 chữ số nguyên, tối đa 8 chữ số thập phân) — không dùng số thực để tránh sai số';

export class UpsertExchangeRateDto {
  @ApiProperty({ example: 'USD', description: 'Mã tiền cần khai tỷ giá' })
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, {
    message: 'Mã tiền phải là mã ISO 4217 gồm đúng 3 chữ cái in hoa',
  })
  currency: string;

  @ApiProperty({
    example: '2026-03-01',
    description: 'Ngày áp dụng (YYYY-MM-DD). Ghi lại cùng ngày là cập nhật, không tạo dòng mới.',
  })
  @IsISO8601(
    { strict: true },
    { message: 'Ngày áp dụng phải theo định dạng YYYY-MM-DD' },
  )
  rateDate: string;

  @ApiProperty({
    example: '24512.3456',
    description: '1 đơn vị ngoại tệ = bao nhiêu đơn vị tiền hạch toán',
  })
  @IsString()
  @Matches(FX_RATE_PATTERN, { message: FX_RATE_MESSAGE })
  rate: string;

  @ApiPropertyOptional({ example: 'manual', default: 'manual' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @ApiPropertyOptional({ example: 'Tỷ giá bán ra của ngân hàng TMCP A' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
