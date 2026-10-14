import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { SourceType } from '../../common/enums/source-type.enum.js';
import { CreateJournalLineDto } from './create-journal-line.dto.js';

export class CreateJournalEntryDto {
  @ApiProperty({
    example: '2026-10-12',
    description: 'Ngày hạch toán (YYYY-MM-DD) — quyết định kỳ kế toán',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date phải theo định dạng YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({ example: 'Bán hàng cho khách A' })
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description: string;

  @ApiPropertyOptional({ example: 'HD-2026-001', description: 'Số chứng từ gốc' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Số chứng từ gốc tối đa 64 ký tự' })
  reference?: string;

  @ApiPropertyOptional({
    description:
      'Khóa chống ghi trùng. Gửi lại cùng khóa sẽ trả về bút toán đã tạo thay vì tạo mới.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: 'idempotencyKey tối đa 128 ký tự' })
  idempotencyKey?: string;

  @ApiPropertyOptional({
    enum: SourceType,
    default: SourceType.MANUAL,
    description:
      'Loại chứng từ nguồn (mục 10.0). Để trống = bút toán nhập tay. Mọi loại khác bắt buộc kèm sourceId.',
  })
  @IsOptional()
  @IsEnum(SourceType, { message: 'sourceType không hợp lệ' })
  sourceType?: SourceType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Id chứng từ nguồn (hóa đơn / phiếu thu / dòng sao kê…). Một chứng từ nguồn chỉ sinh duy nhất một bút toán gốc.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'sourceId không hợp lệ' })
  sourceId?: string;

  @ApiProperty({
    type: [CreateJournalLineDto],
    description: 'Tối thiểu 2 dòng; Σ Nợ phải bằng Σ Có',
  })
  @IsArray()
  @ArrayMinSize(2, { message: 'Bút toán phải có tối thiểu 2 dòng định khoản' })
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines: CreateJournalLineDto[];
}
