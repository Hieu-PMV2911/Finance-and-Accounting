/**
 * Trạng thái kỳ kế toán.
 *
 * - `open`   : đang mở — nhận bút toán.
 * - `locked` : tạm khóa — đóng băng kỳ (không nhận bất kỳ bút toán nào) nhưng
 *              **có thể mở lại** (vd: khóa tạm để chạy báo cáo, sau đó mở lại
 *              nếu phát hiện sai sót).
 * - `closed` : đã chốt — đóng băng kỳ và **không thể mở lại**; số dư cuối kỳ đã
 *              được chốt thành số dư đầu kỳ của kỳ kế tiếp.
 */
export enum FiscalPeriodStatus {
  OPEN = 'open',
  LOCKED = 'locked',
  CLOSED = 'closed',
}

export const ALL_FISCAL_PERIOD_STATUSES: readonly FiscalPeriodStatus[] =
  Object.values(FiscalPeriodStatus);

/** Nhãn tiếng Việt để hiển thị. */
export const FISCAL_PERIOD_STATUS_LABELS: Record<FiscalPeriodStatus, string> = {
  [FiscalPeriodStatus.OPEN]: 'Đang mở',
  [FiscalPeriodStatus.LOCKED]: 'Tạm khóa',
  [FiscalPeriodStatus.CLOSED]: 'Đã chốt',
};

/**
 * Chỉ kỳ đang **mở** mới nhận bút toán.
 * Đây là bất biến số 3 của hệ thống: "khóa kỳ kế toán" — áp dụng cho **mọi**
 * thao tác ghi (tạo nháp, sửa, xóa, ghi sổ, đảo), không riêng ghi sổ.
 */
export function acceptsPostings(status: FiscalPeriodStatus): boolean {
  return status === FiscalPeriodStatus.OPEN;
}
