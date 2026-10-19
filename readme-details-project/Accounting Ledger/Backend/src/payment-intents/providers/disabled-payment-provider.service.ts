import { Injectable, Logger } from '@nestjs/common';

import type {
  PaymentProvider,
  ProviderResult,
} from '../interfaces/payment-provider.interface.js';

/**
 * Nhà cung cấp **chưa cấu hình**.
 *
 * Dùng khi production chưa nối provider thật (hoặc ai đó cấu hình `simulator` ở
 * production — điều bị từ chối có chủ đích). Mọi lời gọi trả `unknown`, **không
 * bao giờ** trả `captured`/`failed`: hệ thống không được phép bịa ra kết quả
 * thanh toán. Intent sẽ nằm ở `unknown` và job tra cứu sẽ leo thang sau ngưỡng.
 */
@Injectable()
export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled';

  private readonly logger = new Logger(DisabledPaymentProvider.name);

  private result(reason: string): ProviderResult {
    return {
      outcome: 'unknown',
      providerRef: null,
      providerStatus: 'not_configured',
      message: reason,
      raw: null,
    };
  }

  async charge(): Promise<ProviderResult> {
    this.logger.warn(
      'Chưa cấu hình nhà cung cấp thanh toán (PAYMENT_PROVIDER) — mọi giao dịch sẽ ở trạng thái chưa xác định',
    );
    return this.result('Chưa cấu hình nhà cung cấp thanh toán');
  }

  async fetch(): Promise<ProviderResult> {
    return this.result('Chưa cấu hình nhà cung cấp thanh toán');
  }
}
