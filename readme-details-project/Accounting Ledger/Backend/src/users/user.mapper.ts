import type { User } from './entities/user.entity.js';

/** Loại bỏ password hash trước khi trả về client. */
export function toPublicUser(user: User): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...user };
  delete safe.passwordHash;
  return safe;
}
