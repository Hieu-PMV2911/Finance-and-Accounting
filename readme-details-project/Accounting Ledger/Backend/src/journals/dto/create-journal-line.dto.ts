import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { CURRENCY_CODE_PATTERN, FX_RATE_SCALE } from '../../common/utils/currency.util.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

const FX_RATE_MESSAGE =
  'Tỷ giá phải là chuỗi số (tối đa 11 chữ số nguyên, tối đa 8 chữ số thập phân)';

/** Chuỗi tỷ giá khớp `NUMERIC(19,8)`. */
const FX_RATE_PATTERN = /^\d{1,11}(\.\d{1,8})?$/;

export class CreateJournalLineDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Tài khoản lá đang hoạt động (isPostable = true)',
  })
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId: string;

  @ApiPropertyOptional({
    example: '1500000.0000',
    description: 'Số tiền ghi Nợ — chỉ điền một trong hai (debit/credit)',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  debit?: string;

  @ApiPropertyOptional({
    example: '0',
    description: 'Số tiền ghi Có — chỉ điền một trong hai (debit/credit)',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  credit?: string;

  @ApiPropertyOptional({ example: 'Bán hàng cho khách A' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải dòng tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Đối tượng của sổ cái phụ (mục 10.0). Chỉ hợp lệ trên dòng thuộc tài khoản công nợ 131*/331*.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'Ngoại tệ của dòng (mục 10.C). Bỏ trống hoặc bằng đơn vị tiền hạch toán ⇒ dòng nội tệ. ' +
      'Khi khai ngoại tệ: `debit`/`credit` vẫn là TIỀN HẠCH TOÁN — bỏ trống thì hệ thống tự quy đổi từ `fxAmount × fxRate`.',
  })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN, {
    message: 'Mã tiền phải là mã ISO 4217 gồm đúng 3 chữ cái in hoa (vd: USD)',
  })
  currency?: string;

  @ApiPropertyOptional({
    example: '1000.0000',
    description:
      'Số tiền ngoại tệ (dương). Bắt buộc khi dòng khai ngoại tệ khác đơn vị tiền hạch toán.',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  fxAmount?: string;

  @ApiPropertyOptional({
    example: '24512.3456',
    description:
      `Tỷ giá: 1 đơn vị ngoại tệ = bao nhiêu tiền hạch toán (tối đa ${FX_RATE_SCALE} chữ số thập phân). ` +
      'Bỏ trống thì hệ thống tra bảng tỷ giá theo ngày hạch toán — thiếu tỷ giá sẽ bị CHẶN, không tự lấy 1.',
  })
  @IsOptional()
  @IsString()
  @Matches(FX_RATE_PATTERN, { message: FX_RATE_MESSAGE })
  fxRate?: string;
}
