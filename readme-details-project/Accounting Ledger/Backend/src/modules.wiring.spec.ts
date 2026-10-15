import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { AccountsModule } from './accounts/accounts.module.js';
import { AccountsService } from './accounts/accounts.service.js';
import { Account } from './accounts/entities/account.entity.js';
import { AuditModule } from './audit/audit.module.js';
import { AuditService } from './audit/audit.service.js';
import { AuditLog } from './audit/entities/audit-log.entity.js';
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
import { Party } from './parties/entities/party.entity.js';
import { ReportsModule } from './reports/reports.module.js';
import { ReportsService } from './reports/reports.service.js';
import { RefreshToken } from './users/entities/refresh-token.entity.js';
import { User } from './users/entities/user.entity.js';
import { UsersModule } from './users/users.module.js';
import { UsersService } from './users/users.service.js';

/**
 * `@InjectDataSource()` cần token `DataSource`, thường do `TypeOrmModule.forRoot()`
 * cung cấp. Trong test DI ta thay bằng stub toàn cục để không phải kết nối DB thật.
 * `subscribers` là mảng thật để `AuditSubscriber` tự đăng ký được khi khởi tạo.
 *
 * ⚠️ Stub này **không** có `entityMetadatas`, nên mọi repository mà module (kể cả
 * module được import gián tiếp) đăng ký qua `TypeOrmModule.forFeature` đều **phải**
 * được `overrideProvider` trong từng test — thiếu một cái là lỗi khó đọc
 * "Cannot read properties of undefined (reading 'find')". Muốn test xanh thì
 * đối chiếu với danh sách `forFeature` của cả cây module đang được import.
 */
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: { subscribers: [] } }],
  exports: [getDataSourceToken()],
})
class StubDataSourceModule {}

/**
 * Một module được coi là **đã được nạp** ở AppModule khi, sau khi loại chú thích,
 * nó xuất hiện theo một trong hai cách:
 *  - phần tử mảng gốc trong `imports` (`    PartiesModule,`), hoặc
 *  - module động (`TypeOrmModule.forRootAsync(...)`, `BullModule.forRootAsync(...)`).
 *
 * Loại chú thích trước khi kiểm tra là điểm mấu chốt: module bị comment out vẫn
 * *trông* như được đăng ký nhưng thực tế không được nạp (bug đã xảy ra với
 * `PartiesModule`, khiến `/api/parties` không tồn tại dù code đầy đủ).
 */
function isModuleRegistered(source: string, name: string): boolean {
  const withoutComments = source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const bareEntry = new RegExp(`^\\s{4}${name},`, 'm').test(withoutComments);
  const dynamicCall = new RegExp(`\\b${name}\\s*\\.\\s*for\\w+\\s*\\(`).test(
    withoutComments,
  );
  return bareEntry || dynamicCall;
}

/**
 * Kiểm tra dependency injection của các module mới mà không cần database thật:
 * repository được thay bằng mock, chỉ xác nhận container resolve được provider.
 */
describe('Module wiring', () => {
  it('AppModule đăng ký mọi *Module mà nó import (không bị chú thích)', async () => {
    const source = await readFile(
      new URL('./app.module.ts', import.meta.url),
      'utf8',
    );
    const declared = [...source.matchAll(/import \{ (\w+Module) \} from/g)].map(
      (match) => match[1],
    );

    // Danh sách rỗng ⇒ regex đã hỏng, không phải app đúng.
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(
        isModuleRegistered(source, name),
        `${name} được import nhưng không được nạp ở AppModule (bị chú thích hoặc thiếu trong mảng imports)`,
      ).toBe(true);
    }
  });

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
      imports: [StubDataSourceModule, LedgerModule],
    })
      .overrideProvider(getRepositoryToken(AccountBalance))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .overrideProvider(getRepositoryToken(JournalLine))
      .useValue({})
      // LedgerModule import PartiesModule ⇒ cây import kéo theo repo `Party`.
      .overrideProvider(getRepositoryToken(Party))
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
      .overrideProvider(getRepositoryToken(JournalLine))
      .useValue({})
      // FiscalPeriodsModule → LedgerModule → PartiesModule.
      .overrideProvider(getRepositoryToken(Party))
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
      // JournalsModule import PartiesModule trực tiếp và qua LedgerModule.
      .overrideProvider(getRepositoryToken(Party))
      .useValue({})
      .compile();

    expect(moduleRef.get(JournalsService)).toBeInstanceOf(JournalsService);
    await moduleRef.close();
  });

  it('ReportsModule khởi tạo được ReportsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ReportsModule],
    })
      .overrideProvider(getRepositoryToken(JournalLine))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .compile();

    expect(moduleRef.get(ReportsService)).toBeInstanceOf(ReportsService);
    await moduleRef.close();
  });

  it('AuditModule khởi tạo được AuditService (kèm Journals + Ledger)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StubDataSourceModule, AuditModule],
    })
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue({})
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
      // AuditModule → JournalsModule → (LedgerModule, PartiesModule).
      .overrideProvider(getRepositoryToken(Party))
      .useValue({})
      .compile();

    expect(moduleRef.get(AuditService)).toBeInstanceOf(AuditService);
    await moduleRef.close();
  });
});
