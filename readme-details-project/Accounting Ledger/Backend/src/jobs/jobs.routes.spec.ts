import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { JobsController } from './jobs.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { WebhooksController } from './webhooks.controller.js';

/**
 * Chốt lại **bề mặt API** của mục 9.
 *
 * Bảng route trong tài liệu (`AGENTS.md` mục 8) rất dễ lệch khỏi code sau vài
 * lần sửa. Test này đọc metadata của Nest (`@Controller`/`@Get`/`@Post`…) để
 * khẳng định đúng danh sách route, đúng HTTP verb, và đúng rào quyền (`@Roles`,
 * `@Public`) — nhờ vậy tài liệu và code không thể trôi khỏi nhau mà không có
 * test đỏ.
 *
 * Đường dẫn ở đây **chưa có tiền tố `/api`** (tiền tố do `app.setGlobalPrefix`
 * trong `main.ts` gắn vào lúc chạy).
 */
function routeTable(controller: unknown): string[] {
  const base = (Reflect.getMetadata(PATH_METADATA, controller as object) as string) ?? '';
  const ctor = controller as { prototype?: Record<string, unknown> };
  const prototype = ctor.prototype as Record<string, unknown> | undefined;

  const routes: string[] = [];
  if (!prototype) return routes;
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === 'constructor') continue;
    const handler = prototype[name];
    const path = Reflect.getMetadata(PATH_METADATA, handler as object);
    if (path === undefined) continue;

    const verb = RequestMethod[
      Reflect.getMetadata(METHOD_METADATA, handler as object) as RequestMethod
    ];
    // `@Get()` không tham số cho path là `'/'` — coi như không có segment nào,
    // nếu không route gốc của controller sẽ thành "notifications//".
    const segments = [base, path as string].filter(
      (part) => part !== undefined && part !== '' && part !== '/',
    );
    routes.push(`${verb} /${segments.join('/')}`);
  }

  return routes.sort();
}

function handlerRoles(
  controller: unknown,
  method: string,
): readonly Role[] | undefined {
  const ctor = controller as { prototype?: Record<string, unknown> };
  const prototype = ctor.prototype as Record<string, unknown> | undefined;
  if (!prototype) return undefined;
  return Reflect.getMetadata(ROLES_KEY, prototype[method] as object) as
    | readonly Role[]
    | undefined;
}

describe('Mục 9 — bề mặt API', () => {
  it('JobsController có đúng các route giám sát / kích hoạt / khắc phục', () => {
    expect(routeTable(JobsController)).toEqual(
      [
        'GET /jobs/overview',
        'GET /jobs/queues',
        'GET /jobs/runs',
        'GET /jobs/runs/:id',
        'GET /jobs/runs/:id/download',
        'GET /jobs/schedules',
        'POST /jobs/balance-snapshot',
        'POST /jobs/integrity-checks',
        'POST /jobs/reports',
        'POST /jobs/runs/:id/retry',
        'POST /jobs/schedules/:name/trigger',
      ].sort(),
    );
  });

  it('NotificationsController có đúng các route thông báo', () => {
    expect(routeTable(NotificationsController)).toEqual(
      [
        'GET /notifications',
        'GET /notifications/unread-count',
        'POST /notifications/:id/read',
        'POST /notifications/read-all',
      ].sort(),
    );
  });

  it('WebhooksController có đúng các route webhook', () => {
    expect(routeTable(WebhooksController)).toEqual(
      [
        'DELETE /webhooks/endpoints/:id',
        'GET /webhooks/deliveries',
        'GET /webhooks/endpoints',
        'GET /webhooks/endpoints/:id',
        'GET /webhooks/events',
        'GET /webhooks/stats',
        'PATCH /webhooks/endpoints/:id',
        'POST /webhooks/deliveries/:id/retry',
        'POST /webhooks/endpoints',
        'POST /webhooks/events',
        'POST /webhooks/inbound',
      ].sort(),
    );
  });

  it('giới hạn quyền đúng chỗ: thao tác ảnh hưởng dữ liệu chỉ admin/poster', () => {
    expect(handlerRoles(JobsController, 'retry')).toEqual([
      Role.ADMIN,
      Role.POSTER,
    ]);
    expect(handlerRoles(JobsController, 'runIntegrityCheck')).toEqual([Role.ADMIN]);
    expect(handlerRoles(JobsController, 'runBalanceSnapshot')).toEqual([
      Role.ADMIN,
      Role.POSTER,
    ]);
    expect(handlerRoles(JobsController, 'triggerSchedule')).toEqual([
      Role.ADMIN,
      Role.POSTER,
    ]);

    // Xếp job sinh báo cáo chỉ là đọc dữ liệu ⇒ mọi người dùng đã đăng nhập.
    expect(handlerRoles(JobsController, 'enqueueReport')).toBeUndefined();
  });

  it('toàn bộ webhook (trừ inbound) khoá ở admin; inbound là route công khai', () => {
    expect(Reflect.getMetadata(ROLES_KEY, WebhooksController)).toEqual([
      Role.ADMIN,
    ]);

    const wCtor = WebhooksController as unknown as { prototype?: Record<string, unknown> };
    const prototype = wCtor.prototype as Record<string, unknown> | undefined;
    expect(prototype).toBeDefined();
    if (prototype) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, prototype.inbound as object)).toBe(
        true,
      );
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, prototype.listEndpoints as object),
      ).toBeUndefined();
    }
  });
});
