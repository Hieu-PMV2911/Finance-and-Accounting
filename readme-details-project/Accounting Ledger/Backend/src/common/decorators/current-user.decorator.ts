import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

/**
 * Lấy người dùng hiện tại từ request.
 * - `@CurrentUser()` → toàn bộ AuthUser
 * - `@CurrentUser('id')` → chỉ lấy trường `id`
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
