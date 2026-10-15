import { Global, Module } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { AccountDefaultsModule } from './account-defaults/account-defaults.module.js';
import { AccountDefaultsService } from './account-defaults/account-defaults.service.js';
import { AccountDefaultRule } from './account-defaults/entities/account-default-rule.entity.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { AccountsService } from './accounts/accounts.service.js';
import { Account } from './accounts/entities/account.entity.js';
import { Allocation } from './allocations/entities/allocation.entity.js';
import { AuditModule } from './audit/audit.module.js';
import { AuditService } from './audit/audit.service.js';
import { AuditLog } from './audit/entities/audit-log.entity.js';
import { VendorBillsModule } from './bills/vendor-bills.module.js';
import { VendorBillsService } from './bills/vendor-bills.service.js';
import {
  VendorBill,
  VendorBillLine,
} from './bills/entities/vendor-bill.entity.js';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { CompaniesService } from './companies/companies.service.js';
import { Company } from './companies/entities/company.entity.js';
import { CurrenciesModule } from './currencies/currencies.module.js';
import { CurrenciesService } from './currencies/currencies.service.js';
import { Currency } from './currencies/entities/currency.entity.js';
import { ExchangeRate } from './currencies/entities/exchange-rate.entity.js';
import { ExchangeRatesService } from './currencies/exchange-rates.service.js';
import { FxDifferenceService } from './currencies/fx-difference.service.js';
import { FiscalPeriod } from './fiscal-periods/entities/fiscal-period.entity.js';
import { FiscalPeriodsModule } from './fiscal-periods/fiscal-periods.module.js';
import { FiscalPeriodsService } from './fiscal-periods/fiscal-periods.service.js';
import { SalesInvoicesModule } from './invoices/sales-invoices.module.js';
import { SalesInvoicesService } from './invoices/sales-invoices.service.js';
import {
  SalesInvoice,
  SalesInvoiceLine,
} from './invoices/entities/sales-invoice.entity.js';
import { JobRun } from './jobs/entities/job-run.entity.js';
import { Notification } from './jobs/entities/notification.entity.js';
import { WebhookDelivery } from './jobs/entities/webhook-delivery.entity.js';
import { WebhookEndpoint } from './jobs/entities/webhook-endpoint.entity.js';
import { WebhookEvent } from './jobs/entities/webhook-event.entity.js';
import { JournalEntry } from './journals/entities/journal-entry.entity.js';
import { JournalLine } from './journals/entities/journal-line.entity.js';
import { JournalsModule } from './journals/journals.module.js';
import { JournalsService } from './journals/journals.service.js';
import { AccountBalance } from './ledger/entities/account-balance.entity.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { LedgerService } from './ledger/ledger.service.js';
import { Party } from './parties/entities/party.entity.js';
import { Payment } from './payments/entities/payment.entity.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PaymentsService } from './payments/payments.service.js';
import { AgingReportService } from './reports/aging-report.service.js';
import { ReportsModule } from './reports/reports.module.js';
import { ReportsService } from './reports/reports.service.js';
import { VatReportService } from './reports/vat-report.service.js';
import { TaxCode } from './taxes/entities/tax-code.entity.js';
import { TaxCodesService } from './taxes/tax-codes.service.js';
import { TaxesModule } from './taxes/taxes.module.js';
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
 * Thay repository cho **cả cây `JobsModule`** (mục 9).
 *
 * Từ P1.4, hóa đơn bán / hóa đơn mua / phiếu thu-chi import `JobsModule` để phát
 * webhook `*.posted` sau khi ghi sổ ⇒ DI test của chúng kéo theo toàn bộ provider của
 * mục 9, mỗi provider lại cần repository riêng. Khai báo **một chỗ** để thêm bảng mới
 * của mục 9 không phải sửa ba test rời rạc.
 */
function withJobsTree(builder: TestingModuleBuilder): TestingModuleBuilder {
  for (const entity of [
    JobRun,
    Notification,
    WebhookEndpoint,
    WebhookDelivery,
    WebhookEvent,
  ]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  return builder;
}

/**
 * Thay repository cho **cả cây `CurrenciesModule`** (mục 10.C.1).
 *
 * Từ 10.C.1, `JournalsModule` import `CurrenciesModule` để tra tỷ giá khi dòng bút
 * toán khai ngoại tệ ⇒ **mọi** test DI đi qua bút toán đều kéo theo ba repository
 * `Company` / `Currency` / `ExchangeRate`. Khai báo một chỗ để lần sau thêm bảng
 * của 10.C không phải sửa từng test rời rạc.
 */
function withCurrencyTree(builder: TestingModuleBuilder): TestingModuleBuilder {
  for (const entity of [Company, Currency, ExchangeRate]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  return builder;
}

/**
 * Thay repository cho **cả cây `TaxesModule`** (mục 10.C.2).
 *
 * Từ 10.C.2, `SalesInvoicesModule` / `VendorBillsModule` import `TaxesModule` để áp thuế
 * khi lập và ghi sổ ⇒ mọi test DI của hai module đó kéo theo repository `TaxCode`.
 */
function withTaxTree(builder: TestingModuleBuilder): TestingModuleBuilder {
  builder.overrideProvider(getRepositoryToken(TaxCode)).useValue({});
  return builder;
}

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

  it('JournalsModule khởi tạo được JournalsService (kèm Accounts + Periods + Ledger + Currencies)', async () => {
    const moduleRef = await withCurrencyTree(
      Test.createTestingModule({
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
        .useValue({}),
    ).compile();

    expect(moduleRef.get(JournalsService)).toBeInstanceOf(JournalsService);
    await moduleRef.close();
  });

  it('ReportsModule khởi tạo được ReportsService, AgingReportService và VatReportService', async () => {
    const moduleRef = await Test.createTestingModule({
      // `AgingReportService` / `VatReportService` đọc thẳng bằng `DataSource.query` ⇒ cần stub.
      imports: [StubDataSourceModule, ReportsModule],
    })
      .overrideProvider(getRepositoryToken(JournalLine))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .compile();

    expect(moduleRef.get(ReportsService)).toBeInstanceOf(ReportsService);
    expect(moduleRef.get(AgingReportService)).toBeInstanceOf(AgingReportService);
    expect(moduleRef.get(VatReportService)).toBeInstanceOf(VatReportService);
    await moduleRef.close();
  });

  it('AuditModule khởi tạo được AuditService (kèm Journals + Ledger + Currencies)', async () => {
    const moduleRef = await withCurrencyTree(
      Test.createTestingModule({
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
        // AuditModule → JournalsModule → (LedgerModule, PartiesModule, CurrenciesModule).
        .overrideProvider(getRepositoryToken(Party))
        .useValue({}),
    ).compile();

    expect(moduleRef.get(AuditService)).toBeInstanceOf(AuditService);
    await moduleRef.close();
  });

  it('AccountDefaultsModule khởi tạo được AccountDefaultsService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccountDefaultsModule],
    })
      .overrideProvider(getRepositoryToken(AccountDefaultRule))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .compile();

    expect(moduleRef.get(AccountDefaultsService)).toBeInstanceOf(
      AccountDefaultsService,
    );
    await moduleRef.close();
  });

  it('SalesInvoicesModule khởi tạo được SalesInvoicesService (kèm AccountDefaults + Parties + Journals + Taxes)', async () => {
    const moduleRef = await withTaxTree(
      withCurrencyTree(
        withJobsTree(
          Test.createTestingModule({
            imports: [StubDataSourceModule, SalesInvoicesModule],
          })
            .overrideProvider(getRepositoryToken(SalesInvoice))
            .useValue({})
            .overrideProvider(getRepositoryToken(SalesInvoiceLine))
            .useValue({})
            // AllocationsModule cũng nằm trong cây import (chặn hủy khi còn phân bổ).
            .overrideProvider(getRepositoryToken(Allocation))
            .useValue({})
            .overrideProvider(getRepositoryToken(AccountDefaultRule))
            .useValue({})
            .overrideProvider(getRepositoryToken(Party))
            .useValue({})
            .overrideProvider(getRepositoryToken(Account))
            .useValue({})
            .overrideProvider(getRepositoryToken(AccountBalance))
            .useValue({})
            .overrideProvider(getRepositoryToken(FiscalPeriod))
            .useValue({})
            .overrideProvider(getRepositoryToken(JournalEntry))
            .useValue({})
            .overrideProvider(getRepositoryToken(JournalLine))
            .useValue({}),
        ),
      ),
    ).compile();

    expect(moduleRef.get(SalesInvoicesService)).toBeInstanceOf(
      SalesInvoicesService,
    );
    await moduleRef.close();
  });

  it('VendorBillsModule khởi tạo được VendorBillsService (kèm AccountDefaults + Parties + Journals + Taxes)', async () => {
    const moduleRef = await withTaxTree(
      withCurrencyTree(
        withJobsTree(
          Test.createTestingModule({
            imports: [StubDataSourceModule, VendorBillsModule],
          })
            .overrideProvider(getRepositoryToken(VendorBill))
            .useValue({})
            .overrideProvider(getRepositoryToken(VendorBillLine))
            .useValue({})
            // AllocationsModule cũng nằm trong cây import (chặn hủy khi còn phân bổ).
            .overrideProvider(getRepositoryToken(Allocation))
            .useValue({})
            .overrideProvider(getRepositoryToken(AccountDefaultRule))
            .useValue({})
            .overrideProvider(getRepositoryToken(Party))
            .useValue({})
            .overrideProvider(getRepositoryToken(Account))
            .useValue({})
            .overrideProvider(getRepositoryToken(AccountBalance))
            .useValue({})
            .overrideProvider(getRepositoryToken(FiscalPeriod))
            .useValue({})
            .overrideProvider(getRepositoryToken(JournalEntry))
            .useValue({})
            .overrideProvider(getRepositoryToken(JournalLine))
            .useValue({}),
        ),
      ),
    ).compile();

    expect(moduleRef.get(VendorBillsService)).toBeInstanceOf(VendorBillsService);
    await moduleRef.close();
  });

  it('PaymentsModule khởi tạo được PaymentsService (kèm Allocations + Journals + Accounts)', async () => {
    const moduleRef = await withCurrencyTree(
      withJobsTree(
        Test.createTestingModule({
          imports: [StubDataSourceModule, PaymentsModule],
        })
          .overrideProvider(getRepositoryToken(Payment))
          .useValue({})
          .overrideProvider(getRepositoryToken(Allocation))
          .useValue({})
          .overrideProvider(getRepositoryToken(Party))
          .useValue({})
          .overrideProvider(getRepositoryToken(Account))
          .useValue({})
          .overrideProvider(getRepositoryToken(AccountBalance))
          .useValue({})
          .overrideProvider(getRepositoryToken(FiscalPeriod))
          .useValue({})
          .overrideProvider(getRepositoryToken(JournalEntry))
          .useValue({})
          .overrideProvider(getRepositoryToken(JournalLine))
          .useValue({}),
      ),
    ).compile();

    expect(moduleRef.get(PaymentsService)).toBeInstanceOf(PaymentsService);
    await moduleRef.close();
  });

  it('CompaniesModule khởi tạo được CompaniesService (mục 10.C.1)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CompaniesModule],
    })
      .overrideProvider(getRepositoryToken(Company))
      .useValue({})
      .compile();

    expect(moduleRef.get(CompaniesService)).toBeInstanceOf(CompaniesService);
    await moduleRef.close();
  });

  it('CurrenciesModule khởi tạo được CurrenciesService, ExchangeRatesService và FxDifferenceService (mục 10.C.1)', async () => {
    const moduleRef = await withCurrencyTree(
      // `PartiesService` (được `FxDifferenceService` dùng để giải đối tượng) cần `DataSource`.
      Test.createTestingModule({
        imports: [StubDataSourceModule, CurrenciesModule],
      })
        .overrideProvider(getRepositoryToken(Account))
        .useValue({})
        .overrideProvider(getRepositoryToken(Party))
        .useValue({}),
    ).compile();

    expect(moduleRef.get(CurrenciesService)).toBeInstanceOf(CurrenciesService);
    expect(moduleRef.get(ExchangeRatesService)).toBeInstanceOf(
      ExchangeRatesService,
    );
    expect(moduleRef.get(FxDifferenceService)).toBeInstanceOf(
      FxDifferenceService,
    );
    await moduleRef.close();
  });

  it('TaxesModule khởi tạo được TaxCodesService (mục 10.C.2)', async () => {
    const moduleRef = await Test.createTestingModule({
      // `TaxCodesService.usageCount` đọc thẳng bằng `DataSource.query` ⇒ cần stub.
      imports: [StubDataSourceModule, TaxesModule],
    })
      .overrideProvider(getRepositoryToken(TaxCode))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .compile();

    expect(moduleRef.get(TaxCodesService)).toBeInstanceOf(TaxCodesService);
    await moduleRef.close();
  });
});
