import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AgingReportService } from './aging-report.service.js';
import { ExportReportDto } from './dto/export-report.dto.js';
import { QueryAgingDto } from './dto/query-aging.dto.js';
import { QueryReportDto } from './dto/query-report.dto.js';
import { ReportKind } from './enums/report.enum.js';
import { ReportExportService } from './report-export.service.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportExportService,
    private readonly aging: AgingReportService,
  ) {}

  @Get('profit-and-loss')
  @ApiOperation({ summary: 'Báo cáo kết quả kinh doanh (P&L)' })
  @ApiOkResponse({ description: 'Doanh thu, chi phí và lợi nhuận thuần' })
  profitAndLoss(@Query() query: QueryReportDto) {
    return this.reports.profitAndLoss(query);
  }

  @Get('balance-sheet')
  @ApiOperation({
    summary: 'Bảng cân đối kế toán',
    description:
      'Tài sản = Nợ phải trả + Vốn chủ sở hữu. toDate là ngày lập báo cáo.',
  })
  @ApiOkResponse({ description: 'Bảng cân đối kế toán' })
  balanceSheet(@Query() query: QueryReportDto) {
    return this.reports.balanceSheet(query);
  }

  @Get('cash-flow')
  @ApiOperation({ summary: 'Báo cáo lưu chuyển tiền tệ (phương pháp trực tiếp)' })
  @ApiOkResponse({ description: 'Dòng tiền vào/ra theo 3 nhóm hoạt động' })
  cashFlow(@Query() query: QueryReportDto) {
    return this.reports.cashFlow(query);
  }

  @Get('receivables-aging')
  @ApiOperation({
    summary: 'Tuổi nợ phải thu theo khách hàng (mục 10.A)',
    description:
      'Số còn lại là dẫn xuất `total − Σ phân bổ`. Σ các nhóm luôn bằng tổng số còn lại.',
  })
  @ApiOkResponse({ description: 'Tuổi nợ phải thu theo nhóm và theo đối tượng' })
  receivablesAging(@Query() query: QueryAgingDto) {
    return this.aging.receivablesAging(query);
  }

  @Get('payables-aging')
  @ApiOperation({ summary: 'Tuổi nợ phải trả theo nhà cung cấp (mục 10.A)' })
  @ApiOkResponse({ description: 'Tuổi nợ phải trả theo nhóm và theo đối tượng' })
  payablesAging(@Query() query: QueryAgingDto) {
    return this.aging.payablesAging(query);
  }

  @Get('revenue-by-party')
  @ApiOperation({
    summary: 'Doanh thu theo khách hàng trong kỳ (mục 10.A)',
    description: 'Đọc thẳng từ journal_lines của các tài khoản 511*, đã trừ bút toán đảo.',
  })
  @ApiOkResponse({ description: 'Doanh thu thuần theo từng khách hàng' })
  revenueByParty(@Query() query: QueryReportDto) {
    return this.aging.revenueByParty(query);
  }

  @Get('export/:kind')
  @ApiOperation({
    summary: 'Xuất báo cáo ra Excel hoặc PDF',
    description: 'kind: profit-and-loss | balance-sheet | cash-flow. format: xlsx | pdf.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  async export(
    @Param('kind', new ParseEnumPipe(ReportKind)) kind: ReportKind,
    @Query() query: ExportReportDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.exporter.export(kind, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.buffer);
  }
}
