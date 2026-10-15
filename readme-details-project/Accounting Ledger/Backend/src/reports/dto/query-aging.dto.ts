import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class QueryAgingDto {
  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Ngày tính tuổi nợ; bỏ trống thì lấy ngày hôm nay theo giờ máy chủ.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'asOfDate phải theo định dạng YYYY-MM-DD',
  })
  asOfDate?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Chỉ xem một đối tượng' })
  @IsOptional()
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Bao gồm cả chứng từ đã tất toán (số còn lại 0) — mặc định ẩn để báo cáo chỉ còn nợ thật.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeSettled phải là true/false' })
  includeSettled?: boolean;
}
