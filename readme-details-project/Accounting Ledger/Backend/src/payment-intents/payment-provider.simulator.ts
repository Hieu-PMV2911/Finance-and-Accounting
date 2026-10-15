import { Injectable, Logger } from '@nestjs/common';

import type {
  PaymentProvider,
  ProviderChargeInput,
  ProviderChargeResult,
  ProviderQueryResult,
} from './interfaces/payment-provider.interface.js';

/** Trạng thái provider ghi nhận cho một `idempotencyKey`. */
interface SimulatedCharge {
  providerRef: string;
  outcome: 'captured' | 'failed' | 'authorized';
  failureReason: string | null;
}

/**
 * **Provider thanh toán mô phỏng** (mục 10.B) — chỉ dùng khi dev/demo.
 *
 * Vì sao cần nó: kịch bản khó nhất của Payment & Reconciliation là *"provider
 * timeout ở lần gọi đầu, tra cứu lại thấy đã thu tiền"*. Không có provider thật
 * nào cho phép tái hiện tình huống đó một cách chủ động, nên ta mô phỏng.
 *
 * Cách mô phỏng (đúng cơ chế thật của một cổng thanh toán):
 * 1. `charge(key)` **ghi nhận** giao dịch vào sổ nội bộ của provider (tiền đã bị
 *    thu ở phía họ), nhưng **đường trả lời bị đứt** ⇒ trả `unknown`, `timedOut = true`.
 *    → Ta mất thông tin, giao dịch vẫn tồn tại.
 * 2. `query(key)` trả về đúng giao dịch đã ghi ⇒ `captured`.
 *    → Có bằng chứng kết luận, lúc này mới được ghi sổ.
 *
 * Chế độ điều khiển qua biến môi trường (chỉ để thử nghiệm):
 * - `PAYMENT_SIMULATOR_MODE=instant`  → `charge` trả `captured` ngay (đường thuận).
 * - `PAYMENT_SIMULATOR_MODE=always-unknown` → `query` mãi mãi `unknown` (thử ngưỡng leo thang).
 * - `reference` bắt đầu bằng `FAIL:` → provider từ chối **có bằng chứng** (`failed`).
 *
 * Sổ nội bộ nằm trong bộ nhớ tiến trình và **được chốt theo `idempotencyKey`** —
 * đúng như provider thật: gọi lại cùng khóa trả về cùng giao dịch, không tạo mới.
 */
@Injectable()
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'simulated';

  private readonly logger = new Logger(SimulatedPaymentProvider.name);
  private readonly ledger = new Map<string, SimulatedCharge>();

  async charge(input: ProviderChargeInput): Promise<ProviderChargeResult> {
    const mode = (process.env.PAYMENT_SIMULATOR_MODE ?? 'timeout-first').trim();

    // Gọi lại cùng khóa ⇒ trả về đúng giao dịch cũ (idempotent như provider thật).
    const existing = this.ledger.get(input.idempotencyKey);
    if (existing) {
      return this.toChargeResult(existing, mode !== 'instant');
    }

    // Từ chối có bằng chứng: dùng để thử nhánh `failed` mà không phải đoán.
    if (input.reference?.startsWith('FAIL:')) {
      const record: SimulatedCharge = {
        providerRef: `sim-${this.shortId(input.idempotencyKey)}`,
        outcome: 'failed',
        failureReason: 'Provider từ chối giao dịch (mô phỏng)',
      };
      this.ledger.set(input.idempotencyKey, record);
      return this.toChargeResult(record, false);
    }

    // Provider ĐÃ ghi nhận tiền — nhưng đường trả lời có thể đứt ở lần đầu.
    const record: SimulatedCharge = {
      providerRef: `sim-${this.shortId(input.idempotencyKey)}`,
      outcome: 'captured',
      failureReason: null,
    };
    this.ledger.set(input.idempotencyKey, record);

    const result = this.toChargeResult(record, mode !== 'instant');
    if (result.timedOut) {
      this.logger.warn(
        `Mô phỏng timeout cho ${input.idempotencyKey} — provider đã ghi nhận ${record.outcome}, ` +
          'tra cứu lại sẽ thấy kết quả',
      );
    }
    return result;
  }

  async query(idempotencyKey: string): Promise<ProviderQueryResult> {
    const mode = (process.env.PAYMENT_SIMULATOR_MODE ?? 'timeout-first').trim();

    if (mode === 'always-unknown') {
      // Cố tình để intent "kẹt" ở unknown ⇒ kiểm chứng ngưỡng leo thang (không tự kết luận).
      return { outcome: 'unknown', providerRef: null, failureReason: null };
    }

    const record = this.ledger.get(idempotencyKey);
    if (!record) {
      // Provider không biết khóa này ⇒ vẫn là "chưa biết", KHÔNG kết luận thất bại.
      return { outcome: 'unknown', providerRef: null, failureReason: null };
    }

    return {
      outcome: record.outcome,
      providerRef: record.providerRef,
      failureReason: record.failureReason,
    };
  }

  private toChargeResult(
    record: SimulatedCharge,
    simulateTimeout: boolean,
  ): ProviderChargeResult {
    if (record.outcome === 'failed') {
      return {
        outcome: 'failed',
        providerRef: record.providerRef,
        failureReason: record.failureReason,
        timedOut: false,
      };
    }

    if (simulateTimeout) {
      // Điểm mấu chốt của 10.B: KHÔNG trả `failed` khi chỉ mất kết nối.
      return {
        outcome: 'unknown',
        providerRef: record.providerRef,
        failureReason: 'Hết thời gian chờ phản hồi từ provider (mô phỏng)',
        timedOut: true,
      };
    }

    return {
      outcome: record.outcome,
      providerRef: record.providerRef,
      failureReason: null,
      timedOut: false,
    };
  }

  private shortId(key: string): string {
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) % 0xffffffff;
    }
    return hash.toString(16).padStart(8, '0');
  }
}
