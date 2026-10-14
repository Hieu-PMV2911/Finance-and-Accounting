import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { QueryReportDto } from '../../reports/dto/query-report.dto.js';
import {
  ReportFormat,
  ReportKind,
} from '../../reports/enums/report.enum.js';

/**
 * Yêu cầu sinh báo cáo ở chế độ nền (mục 9 — "job nền: sinh báo cáo nặng").
 *
 * Giống phạm vi xem báo cáo (kỳ **hoặc** khoảng ngày), thêm:
 * - `format`: nếu có, job sẽ xuất file và lưu lại để tải về sau;
 *             nếu bỏ trống, job chỉ trả về số liệu dạng JSON.
 */
export class EnqueueReportDto extends QueryReportDto {
  @ApiPropertyOptional({ enum: ReportKind, default: ReportKind.PROFIT_AND_LOSS })
  @IsOptional()
  @IsEnum(ReportKind, { message: 'kind không hợp lệ' })
  kind?: ReportKind;

  @ApiPropertyOptional({
    enum: ReportFormat,
    description: 'Bỏ trống để chỉ tính số liệu (không sinh file)',
  })
  @IsOptional()
  @IsEnum(ReportFormat, { message: 'format chỉ nhận "xlsx" hoặc "pdf"' })
  format?: ReportFormat;
}
