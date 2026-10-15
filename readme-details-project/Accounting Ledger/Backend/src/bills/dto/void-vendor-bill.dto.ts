import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VoidVendorBillDto {
  @ApiProperty({
    example: 'Nhà cung cấp xuất sai thông tin — thay bằng hóa đơn khác',
    description: 'Lý do hủy — bắt buộc để lưu vết kiểm toán',
  })
  @IsString()
  @MaxLength(500, { message: 'Lý do hủy tối đa 500 ký tự' })
  reason: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Ngày hạch toán của bút toán đảo; bỏ trống thì dùng ngày hóa đơn. Chỉ dùng khi hóa đơn đã ghi sổ.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;
}
