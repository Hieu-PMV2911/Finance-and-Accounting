import { Injectable, Logger } from '@nestjs/common';

import type {
  PaymentProvider,
  ProviderChargeInput,
  ProviderResult,
} from '../interfaces/payment-provider.interface.js';

/**
 * **Nhà cung cấp mô phỏng — CHỈ DÙNG Ở MÔI TRƯỜNG PHÁT TRIỂN.**
 *
 * Hành vi được cố tình làm xấu đúng như thực tế:
 * - Lần gọi `charge` đầu tiên **timeout**: trả `unknown` dù giao dịch đã được
 *   ghi nhận phía provider. Nếu code coi timeout là thất bại, bài kiểm chứng sẽ
 *   sai ngay.
 * - Lần `fetch` sau đó trả `captured` — "đã thu tiền".
 * - Gửi lại `charge` với **cùng** khóa trả kết quả tra cứu, không tạo giao dịch
 *   thứ hai (đúng ngữ nghĩa idempotency của provider thật).
 *
 * Không có ngẫu nhiên: kịch bản phải lặp lại được trong test và khi demo.
 */
@Injectable()
export class PaymentProviderSimulator implements PaymentProvider {
  readonly name = 'simulator';

  private readonly logger = new Logger(PaymentProviderSimulator.name);
  private readonly charges = new Map<string, { amount: string; at: number }>();

  async charge(input: ProviderChargeInput): Promise<ProviderResult> {
    const existing = this.charges.get(input.idempotencyKey);
    if (existing) {
      // Cùng khóa ⇒ trả lại đúng giao dịch cũ, không thu hai lần.
      return this.fetch(input.idempotencyKey);
    }

    this.charges.set(input.idempotencyKey, {
      amount: input.amount,
      at: Date.now(),
    });
    this.logger.warn(
      `[simulator] Cố tình timeout lần gọi đầu cho ${input.idempotencyKey} — giao dịch ĐÃ được ghi nhận phía provider`,
    );

    return {
      outcome: 'unknown',
      providerRef: this.refOf(input.idempotencyKey),
      providerStatus: 'timeout',
      message:
        'Nhà cung cấp mô phỏng không phản hồi trong thời gian chờ — chưa có kết luận',
      raw: { simulated: 'timeout', amount: input.amount },
    };
  }

  async fetch(idempotencyKey: string): Promise<ProviderResult> {
    const charge = this.charges.get(idempotencyKey);
    if (!charge) {
      return {
        outcome: 'unknown',
        providerRef: null,
        providerStatus: 'not_found',
        message: 'Không tìm thấy giao dịch theo khóa chống trùng',
        raw: null,
      };
    }

    return {
      outcome: 'captured',
      providerRef: this.refOf(idempotencyKey),
      providerStatus: 'captured',
      message: null,
      raw: { simulated: 'captured', amount: charge.amount },
    };
  }

  private refOf(idempotencyKey: string): string {
    return `sim_${idempotencyKey.slice(0, 24)}`;
  }
}
