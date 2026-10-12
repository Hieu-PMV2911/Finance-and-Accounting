import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { Role } from '../enums/role.enum.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(user?: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(roles: Role[] | undefined): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(roles),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('cho qua khi route không yêu cầu vai trò cụ thể', () => {
    const guard = new RolesGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextFor())).toBe(true);
  });

  it('cho qua khi người dùng có vai trò phù hợp', () => {
    const guard = new RolesGuard(reflectorReturning([Role.POSTER]));
    const ctx = contextFor({ id: 'u1', email: 'a@b.c', roles: [Role.POSTER] });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('cho qua khi người dùng có một trong nhiều vai trò yêu cầu', () => {
    const guard = new RolesGuard(reflectorReturning([Role.ADMIN, Role.POSTER]));
    const ctx = contextFor({ id: 'u1', email: 'a@b.c', roles: [Role.POSTER] });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('chặn khi người dùng thiếu vai trò', () => {
    const guard = new RolesGuard(reflectorReturning([Role.ADMIN]));
    const ctx = contextFor({ id: 'u1', email: 'a@b.c', roles: [Role.MAKER] });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('chặn khi chưa xác thực', () => {
    const guard = new RolesGuard(reflectorReturning([Role.ADMIN]));

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
