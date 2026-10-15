import { describe, expect, it } from 'vitest';

import {
  convertToBase,
  exceedsFxRateRange,
  fxDifference,
  fxRateToString,
  invertRate,
  isCurrencyCode,
  normalizeCurrencyCode,
} from './currency.util.js';

describe('currency.util', () => {
  describe('normalizeCurrencyCode / isCurrencyCode', () => {
    it('chuẩn hóa về in hoa và bỏ khoảng trắng', () => {
      expect(normalizeCurrencyCode('  usd ')).toBe('USD');
    });

    it('chỉ nhận mã 3 chữ cái in hoa', () => {
      expect(isCurrencyCode('USD')).toBe(true);
      expect(isCurrencyCode('usd')).toBe(false);
      expect(isCurrencyCode('US')).toBe(false);
      expect(isCurrencyCode('USDD')).toBe(false);
      expect(isCurrencyCode(123)).toBe(false);
      expect(isCurrencyCode(null)).toBe(false);
    });
  });

  describe('convertToBase', () => {
    it('nhân số tiền ngoại tệ với tỷ giá, làm tròn 4 chữ số thập phân', () => {
      expect(convertToBase('1000', '24500')).toBe('24500000.0000');
    });

    it('giữ đủ 4 chữ số thập phân khi tỷ giá lẻ', () => {
      // 1000 × 24512.3456 = 24,512,345.6
      expect(convertToBase('1000', '24512.3456')).toBe('24512345.6000');
    });

    it('làm tròn HALF_UP ở chữ số thập phân thứ 4', () => {
      // 1 × 0.00005 = 0.00005 ⇒ 0.0001 (làm tròn lên)
      expect(convertToBase('1', '0.00005')).toBe('0.0001');
      // 1 × 0.00004 = 0.00004 ⇒ 0.0000
      expect(convertToBase('1', '0.00004')).toBe('0.0000');
    });

    it('không dùng số thực nên không có sai số nhị phân', () => {
      // 0.1 + 0.2 = 0.30000000000000004 với float; ở đây phải chính xác.
      expect(convertToBase('3', '0.1')).toBe('0.3000');
    });

    it('trả 0 khi số tiền bằng 0', () => {
      expect(convertToBase('0', '24500')).toBe('0.0000');
    });
  });

  describe('fxDifference', () => {
    it('dương khi tất toán nhiều hơn giá trị đã ghi nhận', () => {
      expect(fxDifference('24500000', '24700000')).toBe('200000.0000');
    });

    it('âm khi tất toán ít hơn', () => {
      expect(fxDifference('24700000', '24500000')).toBe('-200000.0000');
    });

    it('bằng 0 khi tất toán đúng tỷ giá gốc', () => {
      expect(fxDifference('24500000', '24500000')).toBe('0.0000');
    });
  });

  describe('fxRateToString', () => {
    it('chuẩn hóa về 8 chữ số thập phân (thang của NUMERIC(19,8))', () => {
      expect(fxRateToString('24500')).toBe('24500.00000000');
      expect(fxRateToString('24512.3456789')).toBe('24512.34567890');
    });
  });

  describe('exceedsFxRateRange', () => {
    it('chặn giá trị vượt NUMERIC(19,8)', () => {
      expect(exceedsFxRateRange('99999999999.99999999')).toBe(false);
      expect(exceedsFxRateRange('100000000000')).toBe(true);
    });
  });

  describe('invertRate', () => {
    it('nghịch đảo tỷ giá', () => {
      expect(invertRate('25000')).toBe('0.00004000');
    });

    it('từ chối tỷ giá bằng 0 (chia cho 0)', () => {
      expect(() => invertRate('0')).toThrow();
    });
  });
});
