import { describe, expect, it } from 'vitest';

import { BankTransactionDirection } from './enums/bank-transaction.enum.js';
import { ReconciliationMatchTier } from './enums/bank-transaction.enum.js';
import {
  matchTransaction,
  type MatchCandidate,
  type MatchTransaction,
} from './bank-match.util.js';

/**
 * Logic khớp 3 tầng (P2.3) — phần dễ sai nhất là **thứ tự ưu tiên tầng** và việc
 * tầng 3 chỉ là **gợi ý**, không bao giờ tự chốt.
 */
function txn(overrides: Partial<MatchTransaction> = {}): MatchTransaction {
  return {
    id: 'txn-1',
    bankRef: null,
    reference: null,
    amount: '1500000.0000',
    transactionDate: '2026-10-12',
    description: null,
    direction: BankTransactionDirection.IN,
    ...overrides,
  };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'payment-1',
    code: 'PT-2026-0001',
    reference: null,
    amount: '1500000.0000',
    date: '2026-10-12',
    direction: BankTransactionDirection.IN,
    ...overrides,
  };
}

describe('matchTransaction — 3 tầng', () => {
  it('tầng 1: bankRef trùng mã chứng từ + đúng tiền ⇒ Reference', () => {
    const result = matchTransaction(
      txn({ bankRef: 'PT-2026-0001' }),
      [candidate()],
    );
    expect(result.tier).toBe(ReconciliationMatchTier.REFERENCE);
    expect(result.candidateId).toBe('payment-1');
    expect(result.amount).toBe('1500000.0000');
  });

  it('tầng 1 cũng khớp theo `reference` của dòng sao', () => {
    const result = matchTransaction(
      txn({ reference: 'PT-2026-0001' }),
      [candidate()],
    );
    expect(result.tier).toBe(ReconciliationMatchTier.REFERENCE);
  });

  it('tầng 1 KHÔNG khớp khi sai số tiền (không đoán bừa)', () => {
    const result = matchTransaction(
      txn({ bankRef: 'PT-2026-0001', amount: '999000.0000' }),
      [candidate()],
    );
    // Không tầng nào khớp ⇒ tier null để service ghi ngoại lệ amount_mismatch.
    expect(result.tier).toBeNull();
    expect(result.candidateId).toBeNull();
  });

  it('tầng 2: đúng tiền + ngày trong khoảng N ngày ⇒ AmountDate', () => {
    const result = matchTransaction(
      txn({ transactionDate: '2026-10-14' }),
      [candidate({ date: '2026-10-12' })],
      { toleranceDays: 3 },
    );
    expect(result.tier).toBe(ReconciliationMatchTier.AMOUNT_DATE);
    expect(result.candidateId).toBe('payment-1');
  });

  it('tầng 2 KHÔNG khớp khi ngày vượt quá N ngày', () => {
    const result = matchTransaction(
      txn({ transactionDate: '2026-10-20' }),
      [candidate({ date: '2026-10-12' })],
      { toleranceDays: 3 },
    );
    expect(result.tier).toBeNull();
  });

  it('tầng 3: diễn giải chứa mã chứng từ ⇒ chỉ là FUZZY (gợi ý)', () => {
    const result = matchTransaction(
      txn({
        bankRef: null,
        reference: null,
        description: 'Thanh toan don hang PT-2026-0001 ngay 12/10',
      }),
      [candidate({ amount: '999000.0000' })],
    );
    expect(result.tier).toBe(ReconciliationMatchTier.FUZZY);
    // Gợi ý mờ: đề xuất toàn bộ số tiền dòng sao, người xác nhận sẽ chốt.
    expect(result.amount).toBe('1500000.0000');
  });

  it('tầng 3 không khớp chuỗi con ngắn (PT1 không khớp PT12)', () => {
    const result = matchTransaction(
      txn({
        description: 'Chuyen tien PT123ABC',
      }),
      [candidate({ code: 'PT1' })],
    );
    // Không có token 'PT1' nguyên vẹn trong mô tả ⇒ không gợi ý.
    expect(result.tier === ReconciliationMatchTier.FUZZY).toBe(false);
  });

  it('ưu tiên tầng 1 hơn tầng 2/3, tầng 2 hơn tầng 3', () => {
    // Cùng một candidate vừa khớp tầng 1 (đúng mã + tiền) vừa khớp tầng 3 (mô tả).
    const result = matchTransaction(
      txn({
        bankRef: 'PT-2026-0001',
        description: 'Thanh toan PT-2026-0001',
      }),
      [candidate()],
    );
    expect(result.tier).toBe(ReconciliationMatchTier.REFERENCE);
  });

  it('không khớp chứng từ khác chiều tiền', () => {
    const result = matchTransaction(
      txn({ direction: BankTransactionDirection.OUT, bankRef: 'PT-2026-0001' }),
      [candidate({ direction: BankTransactionDirection.IN })],
    );
    expect(result.tier).toBeNull();
  });

  it('nhiều ứng viên cùng tầng ⇒ chọn ngày gần nhất, kết quả xác định', () => {
    const near = candidate({ id: 'near', date: '2026-10-12' });
    const far = candidate({ id: 'far', date: '2026-10-05' });
    const result = matchTransaction(
      txn({ transactionDate: '2026-10-13' }),
      [far, near],
      { toleranceDays: 30 },
    );
    expect(result.candidateId).toBe('near');
  });

  it('trả tier null khi không có ứng viên nào', () => {
    const result = matchTransaction(txn(), []);
    expect(result.tier).toBeNull();
    expect(result.candidateId).toBeNull();
    expect(result.amount).toBe('0.0000');
  });
});
