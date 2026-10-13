import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { auditContext, type AuditActorContext } from './audit-context.js';

interface AuditRequest {
  user?: AuthUser;
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Mở vùng nhớ `AsyncLocalStorage` cho mỗi request để biết **ai** đang thao tác.
 *
 * Phải là **interceptor** chứ không phải middleware: `req.user` chỉ có sau khi
 * `JwtAuthGuard` chạy, mà guard chạy trước interceptor. Nhờ vậy khi subscriber
 * của TypeORM ghi vết, danh tính người thao tác đã sẵn sàng.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditRequest>();
    const headerAgent = request.headers?.['user-agent'];
    const userAgent = Array.isArray(headerAgent)
      ? (headerAgent[0] ?? null)
      : (headerAgent ?? null);

    const store: AuditActorContext = {
      actorId: request.user?.id ?? null,
      actorEmail: request.user?.email ?? null,
      method: request.method ?? null,
      path: request.originalUrl ?? request.url ?? null,
      ip: request.ip ?? null,
      userAgent,
    };

    return new Observable((subscriber) => {
      // Handler phải chạy BÊN TRONG vùng nhớ, nếu không subscriber sẽ đọc hụt.
      auditContext.run(store, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
