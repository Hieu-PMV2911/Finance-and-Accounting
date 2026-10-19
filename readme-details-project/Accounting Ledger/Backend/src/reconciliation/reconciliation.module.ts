import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PaymentIntentsModule } from '../payment-intents/payment-intents.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BankApiStatementAdapter } from './adapters/bank-api-statement.adapter.js';
import { CsvJsonStatementAdapter } from './adapters/csv-json-statement.adapter.js';
import { BankStatement } from './entities/bank-statement.entity.js';
import { BankTransaction } from './entities/bank-transaction.entity.js';
import { ReconciliationMatch } from './entities/reconciliation-match.entity.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * Đối soát ngân hàng (mục 10.B — P2.2/P2.3).
 *
 * **Một pipeline cho mọi nguồn sao kê**: cả `CsvJsonStatementAdapter` (file)
 * và `BankApiStatementAdapter` (API ngân hàng, hiện khung rỗng) đều implement
 * `StatementSourceAdapter` ⇒ đưa về cùng `NormalizedBankTransaction[]`, rồi đi
 * qua chung chuỗi normalize → chống trùng → khớp 3 tầng → ghi ngoại lệ.
 *
 * `PaymentIntentsModule` được import để dùng `ReconciliationExceptionsService`
 * (bảng chờ việc cho con người). Chiều phụ thuộc một hướng:
 * reconciliation → payment-intents → jobs, không có vòng.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BankStatement, BankTransaction, ReconciliationMatch]),
    AccountsModule,
    FiscalPeriodsModule,
    JournalsModule,
    PaymentsModule,
    PaymentIntentsModule,
    JobsModule,
  ],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    CsvJsonStatementAdapter,
    BankApiStatementAdapter,
  ],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
