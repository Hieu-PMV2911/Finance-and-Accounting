import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

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
}
