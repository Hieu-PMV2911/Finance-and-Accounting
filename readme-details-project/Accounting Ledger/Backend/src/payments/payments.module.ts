import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { AllocationsModule } from '../allocations/allocations.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
// Mục 10.A — phát webhook `payment.posted` sau khi ghi sổ.
import { JobsModule } from '../jobs/jobs.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentAllocationsService } from './payment-allocations.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/**
 * Mục 10.A — phiếu thu/chi (thu tiền khách, trả tiền nhà cung cấp) + phân bổ thanh toán.
 *
 * `AllocationsModule` được import để (1) chặn hủy phiếu còn phân bổ, và (2) ghi phân bổ
 * trong **cùng transaction** có khóa cả hai bên — xem `PaymentAllocationsService`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    PartiesModule,
    AccountsModule,
    FiscalPeriodsModule,
    JournalsModule,
    AllocationsModule,
    JobsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentAllocationsService],
  exports: [PaymentsService, PaymentAllocationsService],
})
export class PaymentsModule {}
