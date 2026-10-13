import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { ReportFormat } from '../enums/report.enum.js';
import { QueryReportDto } from './query-report.dto.js';

/** Xuất báo cáo ra file: phạm vi giống khi xem, thêm định dạng file. */
export class ExportReportDto extends QueryReportDto {
  @ApiProperty({ enum: ReportFormat, example: ReportFormat.XLSX })
  @IsEnum(ReportFormat, { message: 'format chỉ nhận "xlsx" hoặc "pdf"' })
  format: ReportFormat;
}
