import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it } from 'vitest';

import { AccountsModule } from './accounts/accounts.module.js';
import { AccountsService } from './accounts/accounts.service.js';
import { Account } from './accounts/entities/account.entity.js';
import { CommonModule } from './common/common.module.js';
import { FiscalPeriod } from './fiscal-periods/entities/fiscal-period.entity.js';
import { FiscalPeriodsModule } from './fiscal-periods/fiscal-periods.module.js';
import { FiscalPeriodsService } from './fiscal-periods/fiscal-periods.service.js';
import { JournalEntry } from './journals/entities/journal-entry.entity.js';
import { JournalLine } from './journals/entities/journal-line.entity.js';
import { JournalsModule } from './journals/journals.module.js';
import { JournalsService } from './journals/journals.service.js';
import { AccountBalance } from './ledger/entities/account-balance.entity.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { LedgerService } from './ledger/ledger.service.js';
import { RefreshToken } from './users/entities/refresh-token.entity.js';
import { User } from './users/entities/user.entity.js';
import { UsersModule } from './users/users.module.js';
import { UsersService } from './users/users.service.js';

/**
 * `@InjectDataSource()` cần token `DataSource`, thường do `TypeOrmModule.forRoot()`
 * cung cấp. Trong test DI ta thay bằng stub toàn cục để không phải kết nối DB thật.
 */
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: {} }],
  exports: [getDataSourceToken()],
})
class StubDataSourceModule {}

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

  it('LedgerModule khởi tạo được LedgerService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LedgerModule],
    })
      .overrideProvider(getRepositoryToken(AccountBalance))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .compile();

    expect(moduleRef.get(LedgerService)).toBeInstanceOf(LedgerService);
    await moduleRef.close();
  });

  it('FiscalPeriodsModule khởi tạo được FiscalPeriodsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StubDataSourceModule, FiscalPeriodsModule],
    })
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .overrideProvider(getRepositoryToken(JournalEntry))
      .useValue({})
      .overrideProvider(getRepositoryToken(AccountBalance))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .compile();

    expect(moduleRef.get(FiscalPeriodsService)).toBeInstanceOf(
      FiscalPeriodsService,
    );
    await moduleRef.close();
  });

  it('JournalsModule khởi tạo được JournalsService (kèm Accounts + Periods + Ledger)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StubDataSourceModule, JournalsModule],
    })
      .overrideProvider(getRepositoryToken(JournalEntry))
      .useValue({})
      .overrideProvider(getRepositoryToken(JournalLine))
      .useValue({})
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .overrideProvider(getRepositoryToken(AccountBalance))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .compile();

    expect(moduleRef.get(JournalsService)).toBeInstanceOf(JournalsService);
    await moduleRef.close();
  });
});
