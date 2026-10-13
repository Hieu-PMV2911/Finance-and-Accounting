import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { CreateJournalLineDto } from './create-journal-line.dto.js';

/**
 * Chỉ sửa được bút toán **nháp**. Nếu gửi `lines` thì toàn bộ dòng cũ bị thay
 * bằng danh sách mới (không trộn).
 */
export class UpdateJournalEntryDto {
  @ApiPropertyOptional({ example: '2026-10-12' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({ example: 'Bán hàng cho khách A (điều chỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;

  @ApiPropertyOptional({ example: 'HD-2026-001', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Số chứng từ gốc tối đa 64 ký tự' })
  reference?: string | null;

  @ApiPropertyOptional({ type: [CreateJournalLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: 'Bút toán phải có tối thiểu 2 dòng định khoản' })
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines?: CreateJournalLineDto[];
}
