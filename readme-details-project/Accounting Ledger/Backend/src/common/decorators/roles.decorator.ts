import { SetMetadata } from '@nestjs/common';
import type { Role } from '../enums/role.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Yêu cầu người dùng có ít nhất một trong các vai trò chỉ định.
 * Ví dụ: `@Roles(Role.POSTER, Role.ADMIN)`
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
