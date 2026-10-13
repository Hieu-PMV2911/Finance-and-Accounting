import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateFiscalPeriodDto {
  @ApiProperty({
    example: '2026-01',
    description: 'Mã kỳ kế toán (duy nhất) — vd: 2026-01, 2026-Q1, 2026',
  })
  @IsString()
  @MaxLength(32, { message: 'Mã kỳ tối đa 32 ký tự' })
  @Matches(/^[0-9A-Za-z._-]+$/, {
    message: 'Mã kỳ chỉ gồm chữ, số và các ký tự ".", "-", "_"',
  })
  code: string;

  @ApiProperty({ example: 'Tháng 01/2026' })
  @IsString()
  @MaxLength(255, { message: 'Tên kỳ tối đa 255 ký tự' })
  name: string;

  @ApiProperty({ example: '2026-01-01', description: 'Ngày bắt đầu (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate phải theo định dạng YYYY-MM-DD',
  })
  startDate: string;

  @ApiProperty({ example: '2026-01-31', description: 'Ngày kết thúc (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate phải theo định dạng YYYY-MM-DD',
  })
  endDate: string;

  @ApiPropertyOptional({ example: 'Kỳ kế toán tháng đầu năm' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ghi chú tối đa 2000 ký tự' })
  notes?: string;
}
