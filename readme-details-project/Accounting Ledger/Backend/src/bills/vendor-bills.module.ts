import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountDefaultsModule } from '../account-defaults/account-defaults.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AllocationsModule } from '../allocations/allocations.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
// Mục 10.A — phát webhook `vendor_bill.posted` sau khi ghi sổ.
import { JobsModule } from '../jobs/jobs.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PartiesModule } from '../parties/parties.module.js';
// Mục 10.C.2 — giải thuế GTGT đầu vào cho dòng hóa đơn mua + sinh dòng bút toán thuế khi ghi sổ.
import { TaxesModule } from '../taxes/taxes.module.js';
import { VendorBill, VendorBillLine } from './entities/vendor-bill.entity.js';
import { VendorBillsController } from './vendor-bills.controller.js';
import { VendorBillsService } from './vendor-bills.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorBill, VendorBillLine]),
    PartiesModule,
    AccountsModule,
    // Mục 10.A — giải tài khoản chi phí theo luật mặc định.
    AccountDefaultsModule,
    // Mục 10.A — chặn hủy hóa đơn còn phân bổ thanh toán.
    AllocationsModule,
    FiscalPeriodsModule,
    JournalsModule,
    JobsModule,
    // Mục 10.C.2 — mã thuế + tài khoản 1331.
    TaxesModule,
  ],
  controllers: [VendorBillsController],
  providers: [VendorBillsService],
  exports: [VendorBillsService],
})
export class VendorBillsModule {}
