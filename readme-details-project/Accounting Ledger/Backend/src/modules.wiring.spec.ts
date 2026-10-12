import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it } from 'vitest';

import { AccountsModule } from './accounts/accounts.module.js';
import { AccountsService } from './accounts/accounts.service.js';
import { Account } from './accounts/entities/account.entity.js';
import { CommonModule } from './common/common.module.js';
import { RefreshToken } from './users/entities/refresh-token.entity.js';
import { User } from './users/entities/user.entity.js';
import { UsersModule } from './users/users.module.js';
import { UsersService } from './users/users.service.js';

/**
 * Kiểm tra dependency injection của các module mới mà không cần database thật:
 * repository được thay bằng mock, chỉ xác nhận container resolve được provider.
 */
describe('Module wiring', () => {
  it('AccountsModule khởi tạo được AccountsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccountsModule],
    })
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .compile();

    expect(moduleRef.get(AccountsService)).toBeInstanceOf(AccountsService);
    await moduleRef.close();
  });

  it('UsersModule khởi tạo được UsersService (PasswordService toàn cục)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule, UsersModule],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(RefreshToken))
      .useValue({})
      .compile();

    expect(moduleRef.get(UsersService)).toBeInstanceOf(UsersService);
    await moduleRef.close();
  });
});
