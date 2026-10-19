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

export class CreatePaymentIntentDto {
  @ApiPropertyOptional({
    description:
      'Khóa chống trùng gửi sang nhà cung cấp. Bỏ trống ⇒ hệ thống tự sinh. Gửi lại cùng khóa luôn trả về giao dịch cũ.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: 'idempotencyKey tối đa 128 ký tự' })
  idempotencyKey?: string;

  @ApiPropertyOptional({
    enum: PaymentDirection,
    default: PaymentDirection.RECEIPT,
    description: 'Chiều tiền: thu từ khách (receipt) hay trả nhà cung cấp (payment).',
  })
  @IsOptional()
  @IsEnum(PaymentDirection, { message: 'Chiều tiền không hợp lệ' })
  direction?: PaymentDirection;

  @ApiProperty({ format: 'uuid', description: 'Khách hàng / nhà cung cấp' })
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Hóa đơn bán được thanh toán' })
  @IsOptional()
  @IsUUID('4', { message: 'invoiceId không hợp lệ' })
  invoiceId?: string;

  @ApiPropertyOptional({
    example: '2026-10-19',
    description:
      'Ngày hạch toán (YYYY-MM-DD). Bỏ trống ⇒ hôm nay. Ngày này quyết định kỳ kế toán của bút toán khi tiền được thu.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;

  @ApiProperty({ example: '1500000.0000' })
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

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tài khoản tiền dùng khi ghi sổ. Bỏ trống ⇒ suy ra theo phương thức; bắt buộc khi phương thức là "other".',
  })
  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId không hợp lệ' })
  cashAccountId?: string;

  @ApiPropertyOptional({ example: 'DH-2026-0912' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;

  @ApiPropertyOptional({ example: 'Thanh toán đơn hàng tháng 10' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;
}
