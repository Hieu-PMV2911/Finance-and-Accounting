import { describe, expect, it } from 'vitest';

import { nextCronRun } from './cron.util.js';

/**
 * So sánh theo **giờ địa phương** (giờ hệ thống), đúng như lịch cron thực tế
 * chạy — tránh phụ thuộc múi giờ của máy chạy test.
 */
function local(date: Date | null): string | null {
  if (!date) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

describe('nextCronRun', () => {
  it('lịch mỗi N phút: lấy mốc kế tiếp trong cùng giờ', () => {
    const from = new Date(2026, 2, 10, 8, 3, 20);
    expect(local(nextCronRun('*/5 * * * *', from))).toBe('2026-03-10 08:05');
  });

  it('lịch mỗi N phút: đúng mốc thì nhảy sang mốc sau (không trả lại chính nó)', () => {
    const from = new Date(2026, 2, 10, 8, 5, 0);
    expect(local(nextCronRun('*/5 * * * *', from))).toBe('2026-03-10 08:10');
  });

  it('lịch hằng ngày: chưa tới giờ thì lấy hôm nay', () => {
    const from = new Date(2026, 2, 10, 0, 30, 0);
    expect(local(nextCronRun('0 1 * * *', from))).toBe('2026-03-10 01:00');
  });

  it('lịch hằng ngày: đã qua giờ thì lấy ngày mai', () => {
    const from = new Date(2026, 2, 10, 1, 0, 0);
    expect(local(nextCronRun('0 1 * * *', from))).toBe('2026-03-11 01:00');
  });

  it('lịch hằng tuần: lấy đúng thứ trong tuần (2026-03-10 là thứ Ba)', () => {
    const from = new Date(2026, 2, 10, 9, 0, 0);
    // '0 8 * * 1' = 08:00 thứ Hai → thứ Hai kế tiếp là 16/03.
    expect(local(nextCronRun('0 8 * * 1', from))).toBe('2026-03-16 08:00');
  });

  it('lịch hằng tuần: đúng ngày nhưng chưa tới giờ thì giữ nguyên ngày', () => {
    const from = new Date(2026, 2, 16, 7, 0, 0);
    expect(local(nextCronRun('0 8 * * 1', from))).toBe('2026-03-16 08:00');
  });

  it('trả null với biểu thức ngoài phạm vi hỗ trợ', () => {
    expect(nextCronRun('0 0 1 * *')).toBeNull();
    expect(nextCronRun('0 0 * * * *')).toBeNull();
    expect(nextCronRun('không-phải-cron')).toBeNull();
    expect(nextCronRun('30 25 * * *')).toBeNull();
  });
});
