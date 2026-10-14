/** Loại thông báo (mục 9). */
export enum NotificationType {
  /** Nhắc công nợ phải thu / phải trả. */
  DEBT_REMINDER = 'debt-reminder',
  /** Báo cáo sinh nền đã xong, sẵn sàng tải xuống. */
  REPORT_READY = 'report-ready',
  /** Phát hiện vi phạm bất biến nghiệp vụ. */
  INTEGRITY_ALERT = 'integrity-alert',
  /** Thông báo hệ thống chung. */
  SYSTEM = 'system',
}

export const ALL_NOTIFICATION_TYPES: readonly NotificationType[] = Object.values(NotificationType);

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NotificationType.DEBT_REMINDER]: 'Nhắc công nợ',
  [NotificationType.REPORT_READY]: 'Báo cáo sẵn sàng',
  [NotificationType.INTEGRITY_ALERT]: 'Cảnh báo bất biến',
  [NotificationType.SYSTEM]: 'Hệ thống',
};

/** Mức độ nghiêm trọng — dùng để tô màu và để FE lọc nhanh. */
export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export const ALL_NOTIFICATION_SEVERITIES: readonly NotificationSeverity[] =
  Object.values(NotificationSeverity);

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  [NotificationSeverity.INFO]: 'Thông tin',
  [NotificationSeverity.WARNING]: 'Cảnh báo',
  [NotificationSeverity.CRITICAL]: 'Nghiêm trọng',
};

/** Trạng thái đọc. */
export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
}

export const ALL_NOTIFICATION_STATUSES: readonly NotificationStatus[] =
  Object.values(NotificationStatus);

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  [NotificationStatus.UNREAD]: 'Chưa đọc',
  [NotificationStatus.READ]: 'Đã đọc',
};

/**
 * Đối tượng nhận thông báo.
 *
 * `TARGETED` = chỉ người dùng cụ thể (`targetUserId`) nhìn thấy — vd báo cáo
 * vừa sinh xong cho chính người yêu cầu.
 */
export enum NotificationAudience {
  ALL = 'all',
  ADMIN = 'admin',
  TARGETED = 'targeted',
}

export const ALL_NOTIFICATION_AUDIENCES: readonly NotificationAudience[] =
  Object.values(NotificationAudience);

export const NOTIFICATION_AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  [NotificationAudience.ALL]: 'Mọi người dùng',
  [NotificationAudience.ADMIN]: 'Chỉ quản trị',
  [NotificationAudience.TARGETED]: 'Cá nhân',
};
