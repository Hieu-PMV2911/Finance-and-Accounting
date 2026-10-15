import { ApiPropertyOptional } from '@nestjs/swagger';
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

/** Sửa phiếu — trường nào không gửi thì giữ nguyên. Bị chặn khi phiếu đã ghi sổ/hủy. */
export class UpdatePaymentDto {
  @ApiPropertyOptional({ example: 'PT-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Số phiếu tối đa 64 ký tự' })
  code?: string;

  @ApiPropertyOptional({ enum: PaymentDirection })
  @IsOptional()
  @IsEnum(PaymentDirection, { message: 'Chiều phiếu không hợp lệ' })
  direction?: PaymentDirection;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId?: string;

  @ApiPropertyOptional({ example: '2026-10-12' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({ example: '50000000.0000' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  amount?: string;

  @ApiPropertyOptional({ example: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'UNC-20261012-01' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId không hợp lệ' })
  cashAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: 'idempotencyKey tối đa 128 ký tự' })
  idempotencyKey?: string;
}
