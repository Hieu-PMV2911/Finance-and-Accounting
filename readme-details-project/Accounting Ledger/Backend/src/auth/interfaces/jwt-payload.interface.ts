import type { Role } from '../../common/enums/role.enum.js';

export type TokenType = 'access' | 'refresh';

/** Payload nằm trong JWT. */
export interface JwtPayload {
  /** user id */
  sub: string;
  email: string;
  roles: Role[];
  type: TokenType;
  /** issued at (giây) — do thư viện JWT tự thêm */
  iat?: number;
  /** expires at (giây) — do thư viện JWT tự thêm */
  exp?: number;
}
