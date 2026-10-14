import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { VendorBill, VendorBillLine } from './entities/vendor-bill.entity.js';
import { VendorBillsController } from './vendor-bills.controller.js';
import { VendorBillsService } from './vendor-bills.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorBill, VendorBillLine]),
    PartiesModule,
    AccountsModule,
    FiscalPeriodsModule,
    JournalsModule,
  ],
  controllers: [VendorBillsController],
  providers: [VendorBillsService],
  exports: [VendorBillsService],
})
export class VendorBillsModule {}
