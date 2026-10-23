import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Sửa loại tiền — **không** cho sửa `code`.
 *
 * Mã tiền là khóa chính tự nhiên và là đích của khóa ngoại từ `exchange_rates`;
 * đổi nó sẽ làm mồ côi tỷ giá đã khai. Muốn đổi mã thì xóa và tạo lại.
 */
export class UpdateCurrencyDto {
  @ApiPropertyOptional({ example: 'Đô la Mỹ (USD)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'Số chữ số thập phân phải là số nguyên' })
  @Min(0)
  @Max(4)
  decimals?: number;

  @ApiPropertyOptional({
    description:
      'Ngừng sử dụng. Không áp dụng cho đơn vị tiền hạch toán (đổi ở cấu hình công ty trước).',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
