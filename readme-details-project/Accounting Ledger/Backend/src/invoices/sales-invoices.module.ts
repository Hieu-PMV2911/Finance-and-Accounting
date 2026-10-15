import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountDefaultsModule } from '../account-defaults/account-defaults.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AllocationsModule } from '../allocations/allocations.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
// Mục 10.A — phát webhook `sales_invoice.posted` sau khi ghi sổ.
import { JobsModule } from '../jobs/jobs.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { SalesInvoice, SalesInvoiceLine } from './entities/sales-invoice.entity.js';
import { SalesInvoicesController } from './sales-invoices.controller.js';
import { SalesInvoicesService } from './sales-invoices.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesInvoice, SalesInvoiceLine]),
    PartiesModule,
    AccountsModule,
    // Mục 10.A — giải tài khoản doanh thu theo luật mặc định.
    AccountDefaultsModule,
    // Mục 10.A — chặn hủy hóa đơn còn phân bổ thanh toán.
    AllocationsModule,
    FiscalPeriodsModule,
    JournalsModule,
    JobsModule,
  ],
  controllers: [SalesInvoicesController],
  providers: [SalesInvoicesService],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
