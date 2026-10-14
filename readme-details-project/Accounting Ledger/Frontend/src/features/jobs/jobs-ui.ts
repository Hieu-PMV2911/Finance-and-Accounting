import type {
  AppNotificationSeverity,
  JobRunStatus,
  WebhookDeliveryStatus,
  WebhookEventStatus,
} from '@/types/api'

/** Màu badge theo trạng thái lượt chạy job. */
export const JOB_STATUS_BADGE: Record<JobRunStatus, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
}

/** Màu badge theo mức độ nghiêm trọng của thông báo / vi phạm bất biến. */
export const SEVERITY_BADGE: Record<AppNotificationSeverity, string> = {
  info: 'border-slate-200 bg-slate-50 text-slate-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
}

export const DELIVERY_STATUS_BADGE: Record<WebhookDeliveryStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
}

export const EVENT_STATUS_BADGE: Record<WebhookEventStatus, string> = {
  processed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  duplicate: 'border-slate-200 bg-slate-50 text-slate-700',
  late: 'border-amber-200 bg-amber-50 text-amber-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
}

/** Thời lượng job dạng người đọc được. */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1_000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} ph ${Math.round((ms % 60_000) / 1_000)} s`
}

/** Rút gọn id dài cho vừa bảng. */
export function shortId(id: string): string {
  return `${id.slice(0, 8)}…`
}
