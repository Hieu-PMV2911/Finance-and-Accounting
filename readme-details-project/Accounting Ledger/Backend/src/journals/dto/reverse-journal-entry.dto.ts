import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ReverseJournalEntryDto {
  @ApiProperty({
    example: 'Ghi nhận sai tài khoản, đảo để hạch toán lại',
    description: 'Lý do đảo — bắt buộc để lưu vết kiểm toán',
  })
  @IsString()
  @MaxLength(500, { message: 'Lý do đảo tối đa 500 ký tự' })
  reason: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Ngày hạch toán của bút toán đảo; bỏ trống thì dùng ngày của bút toán gốc',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;
}
