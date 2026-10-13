import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Danh tính "ai đang thao tác" cho lượt request hiện tại.
 *
 * Subscriber của TypeORM không nhìn thấy `request` (nó chạy ở tầng dữ liệu),
 * nên người thao tác được truyền xuống bằng `AsyncLocalStorage`: interceptor mở
 * một vùng nhớ theo request, subscriber đọc lại từ đó.
 */
export interface AuditActorContext {
  actorId: string | null;
  actorEmail: string | null;
  method: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const auditContext = new AsyncLocalStorage<AuditActorContext>();
