import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { TAX_RATE_PATTERN } from '../../common/utils/tax.util.js';

const TAX_RATE_MESSAGE =
  'Thuế suất phải là chuỗi số phần trăm (tối đa 5 chữ số nguyên, tối đa 4 chữ số thập phân)';

/**
 * Sửa mã thuế — **không** đổi được `code` (đang được dòng chứng từ tham chiếu) và
 * **không** đổi được `type` (đổi loại thuế là tạo mã mới, không sửa mã cũ).
 */
export class UpdateTaxCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: '8', description: 'Thuế suất phần trăm mới' })
  @IsOptional()
  @IsString()
  @Matches(TAX_RATE_PATTERN, { message: TAX_RATE_MESSAGE })
  rate?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'outputAccountId không hợp lệ' })
  outputAccountId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'inputAccountId không hợp lệ' })
  inputAccountId?: string | null;

  @ApiPropertyOptional({
    description:
      'Ngừng sử dụng. Mã thuế đã dùng vẫn tra cứu được (dòng chứng từ đã lưu thuế suất) nhưng không chọn được cho chứng từ mới.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
