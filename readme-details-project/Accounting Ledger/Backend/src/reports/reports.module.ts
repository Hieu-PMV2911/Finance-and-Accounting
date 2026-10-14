import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Account } from '../accounts/entities/account.entity.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';
import { ReportExportService } from './report-export.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([JournalLine, Account, FiscalPeriod])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService],
  // `ReportExportService` được export để job sinh báo cáo nền (mục 9) tái sử dụng
  // đúng phần dựng file thay vì tự viết lại phần xuất Excel/PDF.
  exports: [ReportsService, ReportExportService],
})
export class ReportsModule {}
