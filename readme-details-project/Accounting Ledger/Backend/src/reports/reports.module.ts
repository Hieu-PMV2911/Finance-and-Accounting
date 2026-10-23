import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Account } from '../accounts/entities/account.entity.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';
import { AgingReportService } from './aging-report.service.js';
import { ReportExportService } from './report-export.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { VatReportService } from './vat-report.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([JournalLine, Account, FiscalPeriod])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService, AgingReportService, VatReportService],
  // `ReportExportService` được export để job sinh báo cáo nền (mục 9) tái sử dụng
  // đúng phần dựng file thay vì tự viết lại phần xuất Excel/PDF.
  // `AgingReportService` được export để job quét hóa đơn quá hạn (mục 10.A) dùng
  // lại đúng phép tính tuổi nợ thay vì tự truy vấn lại hóa đơn/phân bổ.
  // `VatReportService` (mục 10.C.2) export để job/kỳ sau tái dùng bảng kê GTGT.
  exports: [ReportsService, ReportExportService, AgingReportService, VatReportService],
})
export class ReportsModule {}
