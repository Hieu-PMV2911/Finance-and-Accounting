/** Hành động thay đổi dữ liệu được ghi vết. */
export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

export const ALL_AUDIT_ACTIONS: readonly AuditAction[] = Object.values(AuditAction);

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'Tạo mới',
  [AuditAction.UPDATE]: 'Cập nhật',
  [AuditAction.DELETE]: 'Xóa',
};
