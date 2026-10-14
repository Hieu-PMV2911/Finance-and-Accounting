import type {
  IntegrityCheckCode,
  IntegritySeverity,
} from '../enums/integrity.enum.js';

/**
 * Một vi phạm bất biến cụ thể.
 *
 * `details` là ảnh chụp thô của bản ghi liên quan (id, số hiệu, số tiền…) để
 * người xử lý tra thẳng được bản ghi mà không phải tự viết truy vấn.
 */
export interface IntegrityViolation {
  code: IntegrityCheckCode;
  severity: IntegritySeverity;
  /** Mã/tên đối tượng bị ảnh hưởng (bút toán, tài khoản, kỳ…). */
  reference: string;
  message: string;
  details: Record<string, unknown>;
}

/** Kết quả một lần chạy bộ kiểm tra bất biến. */
export interface IntegrityCheckResult {
  checkedAt: string;
  /** Kỳ giới hạn kiểm tra (`null` = toàn bộ sổ). */
  periodId: string | null;
  periodCode: string | null;
  /** Tổng số bút toán đã ghi sổ được đưa vào kiểm tra. */
  checkedJournals: number;
  /** Số lượt kiểm tra đã chạy. */
  checksRun: number;
  violationCount: number;
  /** `true` = không có vi phạm nào. */
  passed: boolean;
  /** Vi phạm nặng nhất gặp phải (`null` khi sạch). */
  highestSeverity: IntegritySeverity | null;
  violations: IntegrityViolation[];
}

/** Bảng tóm tắt kết quả kiểm tra — lưu vào `job_runs.result`. */
export interface IntegrityCheckSummary {
  checkedAt: string;
  periodId: string | null;
  checkedJournals: number;
  violationCount: number;
  passed: boolean;
  highestSeverity: IntegritySeverity | null;
  violations: IntegrityViolation[];
}
