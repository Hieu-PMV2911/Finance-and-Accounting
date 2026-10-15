import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

/**
 * Tạo yêu cầu thanh toán (mục 10.B).
 *
 * `idempotencyKey` là trường **quan trọng nhất**: client phải sinh một khóa và
 * dùng lại **đúng khóa đó** cho mọi lần retry/phục hồi. Nhờ vậy gửi lại request
 * không tạo intent thứ hai, và phục hồi không tạo giao dịch trùng.
 */
export class CreatePaymentIntentDto {
  @ApiProperty({
    example: 'ORDER-2026-0001',
    description:
      'Khóa chống xử lý lặp. Bắt buộc — dùng lại đúng khóa này khi retry để không sinh giao dịch trùng.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  idempotencyKey: string;

  @ApiProperty({ example: '1500000.0000', description: 'Số tiền (chuỗi, 4 số thập phân).' })
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  amount: string;

  @ApiProperty({ example: '2026-10-15', description: 'Ngày nghiệp vụ (YYYY-MM-DD) — dùng để tìm kỳ kế toán khi ghi sổ.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date phải theo định dạng YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({ example: 'VND', default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BANK_TRANSFER })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({ description: 'Đối tượng (khách hàng/nhà cung cấp).' })
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @ApiPropertyOptional({ description: 'Hóa đơn bán mà khoản thu nhắm tới.' })
  @IsOptional()
  @IsUUID()
  salesInvoiceId?: string;

  @ApiPropertyOptional({ description: 'Tài khoản tiền nhận (111/112). Bỏ trống ⇒ suy ra theo method.' })
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @ApiPropertyOptional({ example: 'Thu tiền đơn hàng 0001' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'Mã tham chiếu gửi provider. Bắt đầu bằng "FAIL:" để mô phỏng bị từ chối.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;

  @ApiPropertyOptional({ example: 'PI-2026-0001', description: 'Bỏ trống ⇒ tự sinh.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;
}
