import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VoidPaymentDto {
  @ApiProperty({
    example: 'Ghi nhầm số tiền — thay bằng phiếu khác',
    description: 'Lý do hủy — bắt buộc để lưu vết kiểm toán',
  })
  @IsString()
  @MaxLength(500, { message: 'Lý do hủy tối đa 500 ký tự' })
  reason: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Ngày hạch toán của bút toán đảo; bỏ trống thì dùng ngày phiếu. Chỉ dùng khi phiếu đã ghi sổ.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;
}
