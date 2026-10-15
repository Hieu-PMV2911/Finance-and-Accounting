import type { PaymentMethod } from '../../common/enums/payment-method.enum.js';

/**
 * Hợp đồng với **cổng thanh toán** (mục 10.B).
 *
 * Điểm quan trọng nhất của interface này là nó **không** được phép biến "không
 * biết" thành "thất bại":
 *
 * - `charge` có thể **không trả lời được** (timeout/mất kết nối) ⇒ kết quả
 *   `unknown`, KHÔNG phải `failed`.
 * - `query` là cách duy nhất để có **bằng chứng kết luận**; phải tra cứu bằng
 *   **đúng `idempotencyKey`** đã dùng lúc charge để provider trả về cùng giao dịch
 *   chứ không tạo giao dịch mới.
 *
 * Nhờ vậy hệ thống phân biệt được: *mất kết nối chỉ làm ta mất thông tin, không
 * làm giao dịch biến mất*.
 */
export type ProviderChargeOutcome =
  | 'captured'
  | 'authorized'
  | 'failed'
  | 'unknown';

export type ProviderQueryOutcome =
  | 'captured'
  | 'authorized'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'unknown';

export interface ProviderChargeInput {
  idempotencyKey: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  /** Mô tả/đối chiếu gửi kèm (không dùng để quyết định kết quả). */
  reference?: string | null;
}

export interface ProviderChargeResult {
  outcome: ProviderChargeOutcome;
  providerRef: string | null;
  /** Có giá trị khi `outcome = failed` **có bằng chứng**. */
  failureReason: string | null;
  /** `true` khi lỗi là timeout/mất kết nối (tức "chưa biết", không phải thất bại). */
  timedOut: boolean;
}

export interface ProviderQueryResult {
  outcome: ProviderQueryOutcome;
  providerRef: string | null;
  failureReason: string | null;
}

export interface PaymentProvider {
  /** Tên provider — hiển thị trong log/kiểm toán. */
  readonly name: string;
  charge(input: ProviderChargeInput): Promise<ProviderChargeResult>;
  query(idempotencyKey: string): Promise<ProviderQueryResult>;
}

/** Token DI cho `PaymentProvider` — cho phép thay hiện thực mà không sửa service. */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
