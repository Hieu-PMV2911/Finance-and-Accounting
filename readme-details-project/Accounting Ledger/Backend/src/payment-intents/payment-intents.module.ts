import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
import { SalesInvoice } from '../invoices/entities/sales-invoice.entity.js';
import { JobQueue } from '../jobs/enums/job.enum.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { BankTransaction } from '../reconciliation/entities/bank-transaction.entity.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { PaymentIntent } from './entities/payment-intent.entity.js';
import { PaymentInboundHandler } from './payment-inbound.handler.js';
import { PaymentIntentsController } from './payment-intents.controller.js';
import { PaymentIntentsService } from './payment-intents.service.js';
import { PaymentsProcessor } from './payments.processor.js';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface.js';
import { SimulatedPaymentProvider } from './payment-provider.simulator.js';

/**
 * **Thanh toán** (mục 10.B) — vòng đời yêu cầu thanh toán + provider.
 *
 * Quan hệ module (không có phụ thuộc vòng):
 * - `JobsModule` cấp `QueueService`/`WebhooksService`/`NotificationsService` và
 *   `InboundEventRegistry` để handler tự đăng ký.
 * - `ReconciliationModule` cấp `ReconciliationExceptionsService` để ghi dòng lệch
 *   `late_event_conflict` khi kết quả đến trễ mâu thuẫn.
 * - `JournalsModule` là **bộ máy ghi sổ duy nhất** — khoản tiền đã thu được hạch
 *   toán qua `JournalsService.postDocument`, không có bộ máy thứ hai.
 *
 * Hàng đợi `payments` được đăng ký **ngay tại module này** (kèm `@Processor`) để
 * worker thanh toán nằm cùng nơi với nghiệp vụ thanh toán; `JobsModule` cũng đăng
 * ký cùng tên hàng đợi đó cho `QueueService` — cùng trỏ vào một hàng đợi Redis.
 *
 * `PAYMENT_PROVIDER` là token để thay hiện thực: hiện dùng provider mô phỏng
 * (tái hiện đúng kịch bản timeout ở lần gọi đầu). Muốn tích hợp cổng thật thì chỉ
 * cần đổi provider ở đây, toàn bộ vòng đời phía trên giữ nguyên.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: JobQueue.PAYMENTS }),
    TypeOrmModule.forFeature([PaymentIntent, SalesInvoice, BankTransaction]),
    JobsModule,
    ReconciliationModule,
    JournalsModule,
    AccountsModule,
    PartiesModule,
    FiscalPeriodsModule,
  ],
  controllers: [PaymentIntentsController],
  providers: [
    PaymentIntentsService,
    PaymentInboundHandler,
    PaymentsProcessor,
    { provide: PAYMENT_PROVIDER, useClass: SimulatedPaymentProvider },
  ],
  exports: [PaymentIntentsService],
})
export class PaymentIntentsModule {}
