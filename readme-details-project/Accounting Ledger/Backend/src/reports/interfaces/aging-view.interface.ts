import type { AllocationTargetType } from '../../common/enums/allocation-target-type.enum.js';

/** Khóa nhóm tuổi nợ — dùng chung giữa service, API và giao diện. */
export type AgingBucketKey =
  | 'not_due'
  | 'overdue_1_30'
  | 'overdue_31_60'
  | 'overdue_61_90'
  | 'overdue_over_90'
  | 'no_due_date';

/**
 * Các nhóm **đã quá hạn** (có hạn thanh toán và hạn đã qua).
 *
 * "Chưa đến hạn" và "không có ngày đến hạn" **không** phải nợ quá hạn, nên bất kỳ
 * chỗ nào hỏi "còn gì quá hạn" đều phải loại hai nhóm đó ra — gom vào một chỗ để
 * job nhắc nợ và job quét quá hạn không lệch nhau.
 */
export const OVERDUE_BUCKET_KEYS = [
  'overdue_1_30',
  'overdue_31_60',
  'overdue_61_90',
  'overdue_over_90',
] as const satisfies readonly AgingBucketKey[];

export function isOverdueBucket(bucket: AgingBucketKey): boolean {
  return (OVERDUE_BUCKET_KEYS as readonly AgingBucketKey[]).includes(bucket);
}

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  amount: string;
}

export interface AgingLine {
  targetType: AllocationTargetType;
  targetId: string;
  /** Số chứng từ (invoice_no / bill_no). */
  code: string;
  partyId: string;
  partyCode: string;
  partyName: string;
  date: string;
  dueDate: string | null;
  total: string;
  /** Tổng đã phân bổ thanh toán vào chứng từ này. */
  allocated: string;
  /** `total − allocated` — số còn phải thu/phải trả. */
  outstanding: string;
  /** Số ngày quá hạn tại `asOfDate`; âm = chưa đến hạn; `null` = không có hạn. */
  daysOverdue: number | null;
  bucket: AgingBucketKey;
}

export interface AgingPartyRow {
  partyId: string;
  partyCode: string;
  partyName: string;
  buckets: Record<AgingBucketKey, string>;
  total: string;
}

/**
 * Báo cáo tuổi nợ (mục 10.A).
 *
 * Bất biến số 1 của báo cáo: **Σ các nhóm = Σ outstanding của mọi dòng = `totalOutstanding`**.
 * Nếu lệch thì báo cáo vô nghĩa — nên phép cộng được kiểm bằng test.
 */
export interface AgingView {
  targetType: AllocationTargetType;
  asOfDate: string;
  buckets: AgingBucket[];
  totalOutstanding: string;
  lines: AgingLine[];
  parties: AgingPartyRow[];
}

export interface RevenueByPartyRow {
  partyId: string;
  partyCode: string;
  partyName: string;
  /** Doanh thu thuần = Có − Nợ trên các tài khoản doanh thu. */
  revenue: string;
  journalLines: number;
}

export interface RevenueByPartyView {
  fromDate: string;
  toDate: string;
  totalRevenue: string;
  rows: RevenueByPartyRow[];
}
