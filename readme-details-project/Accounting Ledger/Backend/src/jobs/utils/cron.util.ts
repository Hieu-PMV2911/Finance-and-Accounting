/**
 * Tính lần chạy kế tiếp của một biểu thức cron.
 *
 * ⚠️ Chỉ hỗ trợ **đúng các dạng lịch mà module này dùng**, không phải một cron
 * parser đầy đủ:
 *
 * | Dạng | Ví dụ | Ý nghĩa |
 * |---|---|---|
 * | sao-chéo-N ở trường phút | `5 * * * *` với tiền tố sao-chéo | mỗi N phút |
 * | `M H * * *` | `30 2 * * *` | hằng ngày lúc H:M |
 * | `M H * * D` | `0 8 * * 1` | hằng tuần, thứ D (0 = Chủ nhật) |
 *
 * Dạng khác trả về `null` (giao diện sẽ không hiện "lần chạy kế tiếp").
 *
 * Lý do không dùng thư viện `cron`: nó chỉ là phụ thuộc **bắc cầu** của
 * `@nestjs/schedule` nên không được cài trong `node_modules` (pnpm không
 * hoist). Việc tính `nextRunAt` chỉ để hiển thị, không điều khiển việc chạy job
 * (`@Cron` mới là thứ thực thi), nên một hàm nhỏ, có test là đủ và không phình
 * thêm phụ thuộc.
 */
export function nextCronRun(
  expression: string,
  from: Date = new Date(),
): Date | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
  if (dayOfMonth !== '*' || month !== '*') return null;

  // Dạng "mỗi N phút".
  const stepMatch = /^\*\/(\d+)$/.exec(minuteField);
  if (stepMatch && hourField === '*' && dayOfWeek === '*') {
    const step = Number(stepMatch[1]);
    if (!Number.isInteger(step) || step < 1 || step > 59) return null;

    const base = new Date(from.getTime());
    base.setSeconds(0, 0);

    // Mốc phút kế tiếp chia hết cho `step`; `setMinutes` tự xử lý việc tràn qua
    // giờ/ngày (vd 58 → 60 thành 09:00).
    const nextMinute = (Math.floor(base.getMinutes() / step) + 1) * step;
    const result = new Date(base.getTime());
    result.setMinutes(nextMinute, 0, 0);
    return result;
  }

  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (!isValidMinute(minute) || !isValidHour(hour)) return null;

  // Hằng ngày.
  if (dayOfWeek === '*') {
    const candidate = atTime(from, hour, minute);
    if (candidate.getTime() <= from.getTime()) {
      const tomorrow = new Date(candidate.getTime());
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return candidate;
  }

  // Hằng tuần.
  const weekday = Number(dayOfWeek);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;

  const candidate = atTime(from, hour, minute);
  let delta = (weekday - candidate.getDay() + 7) % 7;
  if (delta === 0 && candidate.getTime() <= from.getTime()) delta = 7;
  if (delta === 0) return candidate;

  const shifted = new Date(candidate.getTime());
  shifted.setDate(shifted.getDate() + delta);
  return shifted;
}

function atTime(base: Date, hour: number, minute: number): Date {
  const candidate = new Date(base.getTime());
  candidate.setHours(hour, minute, 0, 0);
  return candidate;
}

function isValidMinute(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 59;
}

function isValidHour(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 23;
}
