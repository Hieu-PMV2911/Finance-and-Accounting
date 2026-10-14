import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
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
    FiscalPeriodsModule,
    JournalsModule,
  ],
  controllers: [SalesInvoicesController],
  providers: [SalesInvoicesService],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
