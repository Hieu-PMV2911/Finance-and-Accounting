import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Chỉ cho sửa kỳ đang **mở** và **không cho đổi trạng thái** ở đây —
 * trạng thái đi qua các endpoint `open` / `lock` / `close` để giữ đúng vòng đời.
 */
export class UpdateFiscalPeriodDto {
  @ApiPropertyOptional({ example: 'Tháng 01/2026 (điều chỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Tên kỳ tối đa 255 ký tự' })
  name?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate phải theo định dạng YYYY-MM-DD',
  })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate phải theo định dạng YYYY-MM-DD',
  })
  endDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ghi chú tối đa 2000 ký tự' })
  notes?: string | null;
}
