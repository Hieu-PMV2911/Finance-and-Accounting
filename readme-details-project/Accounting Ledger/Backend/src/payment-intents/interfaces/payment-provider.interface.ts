import type { PaymentMethod } from '../../common/enums/payment-method.enum.js';

/** Token DI — cho phép thay nhà cung cấp mà không sửa service nghiệp vụ. */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

/**
 * Kết quả một lần gọi nhà cung cấp — **chỉ có 6 khả năng**, và `unknown` là một
 * trong số đó.
 *
 * Đây là điểm thiết kế quan trọng nhất của P2.1: hàm gọi provider **không** trả
 * `boolean`/`throw` cho timeout, vì như vậy timeout sẽ bị hiểu là thất bại. Nó
 * trả một *kết luận* (hoặc nói thẳng rằng chưa có kết luận).
 */
export type ProviderOutcome =
  | 'captured'
  | 'authorized'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'unknown';

export interface ProviderChargeInput {
  /** Khóa chống trùng — **cùng khóa phải trả cùng giao dịch**. */
  idempotencyKey: string;
  amount: string;
  currency: string | null;
  method: PaymentMethod;
  description?: string | null;
}

export interface ProviderResult {
  outcome: ProviderOutcome;
  providerRef: string | null;
  /** Trạng thái thô của provider, lưu lại để điều tra về sau. */
  providerStatus: string;
  /** Giải thích khi `unknown`/`failed` (để thông báo cho người vận hành). */
  message: string | null;
  raw: Record<string, unknown> | null;
}

/**
 * Hợp đồng tối thiểu của một nhà cung cấp thanh toán.
 *
 * `fetch` **bắt buộc** tra theo `idempotencyKey` (không theo mã nội bộ): đó là
 * định danh duy nhất mà cả hai bên cùng biết, kể cả khi lần `charge` đầu tiên
 * timeout trước khi ta kịp lưu `providerRef`.
 */
export interface PaymentProvider {
  readonly name: string;
  charge(input: ProviderChargeInput): Promise<ProviderResult>;
  fetch(idempotencyKey: string): Promise<ProviderResult>;
}
