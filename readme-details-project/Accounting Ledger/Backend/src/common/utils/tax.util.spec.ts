import { describe, expect, it } from 'vitest';

import {
  computeTaxAmount,
  isTaxRateInRange,
  MAX_TAX_RATE_PERCENT,
  taxRateToString,
} from './tax.util.js';

/**
 * Phép tính thuế là **nguồn sự thật duy nhất** cho số thuế của một dòng (mục 10.C.2) —
 * mọi nơi khác gọi nó thay vì tự nhân chia. Vì vậy quy tắc làm tròn phải bị khoá bằng
 * test: nếu đổi `computeTaxAmount` mà không cập nhật ở đây thì bảng kê thuế và bút toán
 * sẽ lệch nhau.
 */
describe('tax.util', () => {
  describe('computeTaxAmount', () => {
    it('tính đúng tiền thuế theo phần trăm', () => {
      expect(computeTaxAmount('1000000', '10')).toBe('100000.0000');
      expect(computeTaxAmount('1000000', '8')).toBe('80000.0000');
      expect(computeTaxAmount('2000000', '5')).toBe('100000.0000');
    });

    it('thuế suất 0 ⇒ không có thuế', () => {
      expect(computeTaxAmount('1234567.8901', '0')).toBe('0.0000');
    });

    it('làm tròn nửa lên về 4 chữ số thập phân (thang của cột tiền)', () => {
      // 333333 × 10% = 33333.3
      expect(computeTaxAmount('333333', '10')).toBe('33333.3000');
      // 0.05 × 10% = 0.005 → 0.0050 (không mất chữ số)
      expect(computeTaxAmount('0.05', '10')).toBe('0.0050');
      // 1.00001 × 10% = 0.100001 → làm tròn về 0.1000
      expect(computeTaxAmount('1.00001', '10')).toBe('0.1000');
    });

    it('thuế suất lẻ vẫn chính xác (4.5%)', () => {
      expect(computeTaxAmount('1000000', '4.5')).toBe('45000.0000');
    });
  });

  describe('taxRateToString', () => {
    it('chuẩn hóa về 4 chữ số thập phân', () => {
      expect(taxRateToString('10')).toBe('10.0000');
      expect(taxRateToString('8.5')).toBe('8.5000');
      expect(taxRateToString(0)).toBe('0.0000');
    });
  });

  describe('isTaxRateInRange', () => {
    it('nhận [0, 100]', () => {
      expect(isTaxRateInRange('0')).toBe(true);
      expect(isTaxRateInRange('10')).toBe(true);
      expect(isTaxRateInRange('100')).toBe(true);
      expect(isTaxRateInRange(MAX_TAX_RATE_PERCENT)).toBe(true);
    });

    it('từ chối ngoài khoảng (bắt lỗi gõ "1000" thay vì "10")', () => {
      expect(isTaxRateInRange('100.0001')).toBe(false);
      expect(isTaxRateInRange('101')).toBe(false);
      expect(isTaxRateInRange('-1')).toBe(false);
    });
  });
});
