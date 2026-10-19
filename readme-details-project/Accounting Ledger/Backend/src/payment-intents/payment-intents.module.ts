import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { JournalsModule } from '../journals/journals.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { PaymentIntent } from './entities/payment-intent.entity.js';
import { ReconciliationException } from './entities/reconciliation-exception.entity.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './interfaces/payment-provider.interface.js';
import { PaymentIntentsController } from './payment-intents.controller.js';
import { PaymentIntentsService } from './payment-intents.service.js';
import { DisabledPaymentProvider } from './providers/disabled-payment-provider.service.js';
import { PaymentProviderSimulator } from './providers/payment-provider-simulator.service.js';
import { ReconciliationExceptionsController } from './reconciliation-exceptions.controller.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';

/**
 * Mục 10.B — vòng đời thanh toán qua provider (P2.1).
 *
 * `PAYMENT_PROVIDER` chọn hiện thực **một chỗ**:
 * - `simulator` (chỉ dev): lần gọi đầu cố tình timeout, lần tra cứu sau báo đã
 *   thu tiền — đúng kịch bản nghiệm thu "timeout không phải thất bại".
 * - `disabled` (mặc định): chưa nối provider thật ⇒ mọi giao dịch ở `unknown`
 *   và leo thang sau ngưỡng. **Không bao giờ** bịa ra kết quả.
 *
 * Cấu hình sai là lỗi **lúc khởi động**, không phải lỗi lúc chạy: dùng
 * simulator ở production hoặc đặt một tên provider không tồn tại đều bị từ chối.
 *
 * `JobsModule` được import để dùng `WebhooksService` (nhận `payment.captured`) và
 * `NotificationsService` (leo thang). Chiều phụ thuộc chỉ một hướng:
 * payment-intents → jobs, không có vòng.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, ReconciliationException]),
    PartiesModule,
    AccountsModule,
    FiscalPeriodsModule,
    JournalsModule,
    JobsModule,
  ],
  controllers: [PaymentIntentsController, ReconciliationExceptionsController],
  providers: [
    PaymentIntentsService,
    ReconciliationExceptionsService,
    PaymentProviderSimulator,
    DisabledPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider => {
        const requested = (
          config.get<string>('PAYMENT_PROVIDER') ?? 'disabled'
        )
          .trim()
          .toLowerCase();

        if (requested === 'simulator') {
          if (config.get<string>('NODE_ENV') === 'production') {
            throw new Error(
              'PAYMENT_PROVIDER=simulator chỉ dùng ở môi trường phát triển — production phải dùng provider thật hoặc "disabled"',
            );
          }
          return new PaymentProviderSimulator();
        }

        if (requested === 'disabled') {
          return new DisabledPaymentProvider();
        }

        throw new Error(
          `PAYMENT_PROVIDER="${requested}" không tồn tại — chỉ hỗ trợ "simulator" (dev) và "disabled"`,
        );
      },
    },
  ],
  exports: [PaymentIntentsService, ReconciliationExceptionsService],
})
export class PaymentIntentsModule {}
