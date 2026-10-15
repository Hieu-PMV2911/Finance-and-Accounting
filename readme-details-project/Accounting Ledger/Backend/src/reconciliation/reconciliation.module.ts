import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
// Mục 10.B — nhập sao kê chạy trong job nền (`statements`).
import { JobQueue } from '../jobs/enums/job.enum.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { BankApiStatementAdapter } from './adapters/bank-api-statement.adapter.js';
import { CsvJsonStatementAdapter } from './adapters/csv-json-statement.adapter.js';
import { BankStatementsController } from './bank-statements.controller.js';
import { BankStatementsService } from './bank-statements.service.js';
import { BankStatement } from './entities/bank-statement.entity.js';
import { BankTransaction } from './entities/bank-transaction.entity.js';
import { ReconciliationException } from './entities/reconciliation-exception.entity.js';
import { ReconciliationMatch } from './entities/reconciliation-match.entity.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { StatementsProcessor } from './statements.processor.js';

/**
 * **Payment & Reconciliation** (mục 10.B) — sao kê ngân hàng & đối soát.
 *
 * Hai quyết định thiết kế thể hiện ngay ở module này:
 *
 * 1. **Một mô hình giao dịch chuẩn** (quyết định #4): `bank_transactions` là nơi
 *    duy nhất chứa giao dịch ngân hàng. `CsvJsonStatementAdapter` (đang dùng) và
 *    `BankApiStatementAdapter` (khung cho tương lai) chỉ khác nhau ở bước đọc;
 *    từ `NormalizedBankTransaction` trở đi mọi thứ dùng chung một đường.
 * 2. **Đối soát không hạch toán**: module này **không** inject `JournalsService`.
 *    Nó chỉ phát hiện và ghi lại chênh lệch; bút toán phí/lãi ngân hàng do người
 *    dùng tạo qua luồng bút toán bình thường.
 *
 * `Payment` được đăng ký trực tiếp qua `forFeature` (không import `PaymentsModule`)
 * vì đối soát chỉ **đọc** phiếu đã ghi sổ — tránh phụ thuộc vòng giữa hai module.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: JobQueue.STATEMENTS }),
    TypeOrmModule.forFeature([
      BankStatement,
      BankTransaction,
      ReconciliationMatch,
      ReconciliationException,
      Payment,
    ]),
    AccountsModule,
    JobsModule,
  ],
  controllers: [BankStatementsController, ReconciliationController],
  providers: [
    BankStatementsService,
    ReconciliationService,
    ReconciliationExceptionsService,
    CsvJsonStatementAdapter,
    BankApiStatementAdapter,
    StatementsProcessor,
  ],
  // `ReconciliationExceptionsService` được export để module thanh toán (10.B) ghi
  // được dòng lệch `late_event_conflict` khi webhook đến trễ mâu thuẫn trạng thái.
  exports: [
    BankStatementsService,
    ReconciliationService,
    ReconciliationExceptionsService,
  ],
})
export class ReconciliationModule {}
