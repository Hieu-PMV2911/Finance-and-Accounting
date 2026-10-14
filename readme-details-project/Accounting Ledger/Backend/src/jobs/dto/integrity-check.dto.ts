import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Chạy kiểm tra bất biến ngay (mục 9), tùy chọn giới hạn vào một kỳ. */
export class IntegrityCheckDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Bỏ trống = kiểm tra toàn bộ sổ',
  })
  @IsOptional()
  @IsUUID('4', { message: 'periodId không hợp lệ' })
  periodId?: string;
}
