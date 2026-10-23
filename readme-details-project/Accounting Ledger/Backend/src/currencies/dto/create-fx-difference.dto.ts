import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { FxDifferenceKind } from '../../common/enums/fx-difference.enum.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

export class CreateFxDifferenceDto {
  @ApiProperty({ example: '2026-03-15', description: 'Ngày hạch toán chênh lệch' })
  @IsISO8601({ strict: true }, { message: 'Ngày phải theo định dạng YYYY-MM-DD' })
  date: string;

  @ApiProperty({ format: 'uuid', description: 'Đối tượng có công nợ ngoại tệ' })
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Tài khoản công nợ lá (131* phải thu hoặc 331* phải trả). Chiều công nợ được suy ra từ tiền tố mã tài khoản.',
  })
  @IsUUID('4', { message: 'partyAccountId không hợp lệ' })
  partyAccountId: string;

  @ApiProperty({
    example: '24500000.0000',
    description: 'Giá trị công nợ đã ghi nhận trên sổ, tính bằng tiền hạch toán',
  })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  bookedBaseAmount: string;

  @ApiProperty({
    example: '24700000.0000',
    description: 'Giá trị thực tế khi tất toán, tính bằng tiền hạch toán',
  })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  settledBaseAmount: string;

  @ApiPropertyOptional({
    enum: FxDifferenceKind,
    description:
      'Bỏ trống ⇒ tự suy ra lãi/lỗ đã thực hiện từ dấu chênh lệch. Truyền `unrealized` để hạch toán vào TK 413 (đánh giá lại cuối kỳ, chưa thực hiện).',
  })
  @IsOptional()
  @IsEnum(FxDifferenceKind, { message: 'Loại chênh lệch tỷ giá không hợp lệ' })
  kind?: FxDifferenceKind;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 'Kết chuyển chênh lệch tỷ giá khi tất toán công nợ' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
