import dayjs from 'dayjs'

import type { FiscalPeriod, ReportScope } from '@/types/api'

/**
 * Chuẩn hóa phạm vi truy vấn thành query params cho API sổ cái / báo cáo.
 *
 * Backend nhận **hoặc** `periodId` **hoặc** `fromDate` + `toDate`; gửi lẫn cả
 * hai sẽ bị từ chối (400). Vì vậy khi có `periodId` ta bỏ hẳn phần ngày.
 */
export function scopeParams(scope: ReportScope): Record<string, string> {
  const params: Record<string, string> = {}
  if (scope.periodId) {
    params.periodId = scope.periodId
    return params
  }
  if (scope.fromDate) params.fromDate = scope.fromDate
  if (scope.toDate) params.toDate = scope.toDate
  return params
}

/** Phạm vi đã đủ dữ liệu để gọi API chưa (có kỳ, hoặc có cả ngày đầu lẫn ngày cuối). */
export function isScopeReady(scope: ReportScope): boolean {
  if (scope.periodId) return true
  return Boolean(scope.fromDate && scope.toDate)
}

/** Mô tả ngắn gọn phạm vi — dùng cho phụ đề và tên file xuất. */
export function scopeLabel(
  scope: ReportScope,
  periodCode?: string | null,
): string {
  if (scope.periodId) return periodCode ? `Kỳ ${periodCode}` : 'Theo kỳ'
  if (scope.fromDate && scope.toDate) {
    return `${scope.fromDate} → ${scope.toDate}`
  }
  return 'Chưa chọn phạm vi'
}

/** Hậu tố tên file an toàn (bỏ dấu tiếng Việt) để tránh lỗi encoding khi tải. */
export function scopeFileSuffix(scope: ReportScope): string {
  if (scope.periodId) return 'theo-ky'
  if (scope.fromDate && scope.toDate) {
    return `${scope.fromDate}_${scope.toDate}`
  }
  return 'toan-bo'
}

/**
 * Phạm vi mặc định khi mở trang: **kỳ mới nhất** (báo cáo thường chạy cho kỳ
 * gần nhất); nếu chưa có kỳ nào thì lấy từ đầu năm đến hôm nay.
 *
 * Hàm này chỉ được gọi **một lần** trong bộ khởi tạo `useState` sau khi danh
 * sách kỳ đã tải xong — tránh phải setState trong `useEffect`.
 */
export function defaultScope(periods: readonly FiscalPeriod[]): ReportScope {
  const latest = periods.at(-1)
  if (latest) return { periodId: latest.id }
  return {
    fromDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    toDate: dayjs().format('YYYY-MM-DD'),
  }
}
