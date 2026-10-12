import type { Role } from '../enums/role.enum.js';

/** Payload gắn vào `request.user` sau khi JWT được xác thực. */
export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
}
