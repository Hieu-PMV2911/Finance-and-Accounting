import { describe, expect, it } from 'vitest';

import { parseDurationToSeconds } from './duration.util.js';

describe('parseDurationToSeconds', () => {
  it('mặc định đơn vị là giây', () => {
    expect(parseDurationToSeconds('30')).toBe(30);
  });

  it('hỗ trợ giây / phút / giờ / ngày', () => {
    expect(parseDurationToSeconds('45s')).toBe(45);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('1h')).toBe(3600);
    expect(parseDurationToSeconds('7d')).toBe(604800);
  });

  it('bỏ qua khoảng trắng', () => {
    expect(parseDurationToSeconds(' 2 h ')).toBe(7200);
  });

  it('ném lỗi khi giá trị không hợp lệ', () => {
    expect(() => parseDurationToSeconds('abc')).toThrow();
    expect(() => parseDurationToSeconds('-5m')).toThrow();
  });
});
