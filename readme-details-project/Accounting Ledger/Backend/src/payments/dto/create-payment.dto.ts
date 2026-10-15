import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaymentDirection } from '../../common/enums/payment-direction.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

export class CreatePaymentDto {
  @ApiProperty({ example: 'PT-2026-001', description: 'Số phiếu (duy nhất)' })
  @IsString()
  @MaxLength(64, { message: 'Số phiếu tối đa 64 ký tự' })
  code: string;

  @ApiProperty({ enum: PaymentDirection, example: PaymentDirection.RECEIPT })
  @IsEnum(PaymentDirection, { message: 'Chiều phiếu không hợp lệ' })
  direction: PaymentDirection;

  @ApiProperty({ format: 'uuid', description: 'Khách hàng / nhà cung cấp' })
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId: string;

  @ApiProperty({ example: '2026-10-12', description: 'Ngày phiếu (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({ example: '50000000.0000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  amount: string;

  @ApiPropertyOptional({ example: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BANK_TRANSFER })
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  method: PaymentMethod;

  @ApiPropertyOptional({ example: 'UNC-20261012-01' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;

  @ApiPropertyOptional({ example: 'Thu tiền hàng tháng 10' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tài khoản tiền (111/112). Bỏ trống ⇒ suy ra theo phương thức; bắt buộc khi phương thức là "other".',
  })
  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId không hợp lệ' })
  cashAccountId?: string;

  @ApiPropertyOptional({
    description:
      'Khóa chống ghi trùng. Gửi lại cùng khóa sẽ trả về phiếu đã tạo thay vì tạo mới.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: 'idempotencyKey tối đa 128 ký tự' })
  idempotencyKey?: string;
}
