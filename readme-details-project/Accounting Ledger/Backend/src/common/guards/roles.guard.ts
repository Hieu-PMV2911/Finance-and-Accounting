import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { Role } from '../enums/role.enum.js';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

/**
 * Guard kiểm tra vai trò. Chạy sau JwtAuthGuard.
 * Nếu route không gắn `@Roles(...)` thì cho qua.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();

    if (!user) {
      throw new ForbiddenException('Người dùng chưa được xác thực');
    }

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Bạn không có quyền thực hiện thao tác này (yêu cầu: ${requiredRoles.join(', ')})`,
      );
    }

    return true;
  }
}
