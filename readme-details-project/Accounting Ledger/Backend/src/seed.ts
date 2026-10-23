import type { INestApplicationContext } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AccountDefaultsService } from './account-defaults/account-defaults.service.js';
import { AccountsService } from './accounts/accounts.service.js';
import { AppModule } from './app.module.js';
import {
  ACCOUNT_DEFAULT_SCOPE_LABELS,
  AccountDefaultScope,
  ANY_CATEGORY,
} from './common/enums/account-default-scope.enum.js';
import { Role } from './common/enums/role.enum.js';
import { PasswordService } from './common/services/password.service.js';
import {
  CompaniesService,
  DEFAULT_BASE_CURRENCY,
  DEFAULT_COMPANY_CODE,
} from './companies/companies.service.js';
import { CurrenciesService } from './currencies/currencies.service.js';
import { ExchangeRatesService } from './currencies/exchange-rates.service.js';
import { TaxCodesService } from './taxes/tax-codes.service.js';
import { UsersService } from './users/users.service.js';

/**
 * Tạo tài khoản quản trị đầu tiên (bootstrap).
 *
 * Cách chạy:
 *   pnpm build && pnpm seed
 * hoặc truyền biến môi trường:
 *   ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='...' pnpm seed
 */
async function seedAdmin(app: INestApplicationContext): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

  const users = app.get(UsersService);
  const passwordService = app.get(PasswordService);

  const existing = await users.findByEmail(email);
  if (existing) {
    console.log(`ℹ️  Người dùng "${email}" đã tồn tại — bỏ qua.`);
    return;
  }

  const passwordHash = await passwordService.hash(password);
  await users.create({
    email,
    passwordHash,
    fullName: 'Quản trị viên',
    roles: [Role.ADMIN],
  });

  console.log('✅ Đã tạo tài khoản quản trị:');
  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
  console.log('   ⚠️  Hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên.');
}

/**
 * Khai **luật nền** `*` cho bán hàng và mua hàng (mục 10.A).
 *
 * Vì sao luật nền chứ không phải luật theo từng loại: cùng một tài khoản doanh thu
 * (chi phí) dùng cho mọi loại dịch vụ là trường hợp phổ biến; doanh nghiệp chỉ khai
 * thêm luật chi tiết khi thật sự cần tách. Nhờ vậy hóa đơn lập được ngay sau khi cài.
 *
 * Idempotent: nếu `(scope, '*')` đã tồn tại thì bỏ qua — **không** ghi đè chính sách
 * mà người dùng đã khai.
 */
async function seedAccountDefaults(app: INestApplicationContext): Promise<void> {
  const defaults = app.get(AccountDefaultsService);
  const accounts = app.get(AccountsService);

  const targets = [
    { scope: AccountDefaultScope.SALES, prefix: '511', label: 'doanh thu (511*)' },
    { scope: AccountDefaultScope.PURCHASE, prefix: '642', label: 'chi phí (642*)' },
  ] as const;

  for (const target of targets) {
    const account = await accounts.findOneByCodePattern(target.prefix);
    if (!account) {
      console.log(
        `ℹ️  Bỏ qua luật mặc định ${ACCOUNT_DEFAULT_SCOPE_LABELS[target.scope]}: ` +
          `chưa có tài khoản ${target.label} trong hệ thống tài khoản.`,
      );
      continue;
    }

    try {
      await defaults.create({
        scope: target.scope,
        category: ANY_CATEGORY,
        accountId: account.id,
        description: `Luật nền cho ${ACCOUNT_DEFAULT_SCOPE_LABELS[target.scope]}`,
      });
      console.log(
        `✅ Luật mặc định ${ACCOUNT_DEFAULT_SCOPE_LABELS[target.scope]} → ${account.code} ${account.name}`,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(
          `ℹ️  Luật nền cho ${ACCOUNT_DEFAULT_SCOPE_LABELS[target.scope]} đã tồn tại — bỏ qua.`,
        );
        continue;
      }
      throw error;
    }
  }
}

/**
 * Mục 10.C.1 — công ty mặc định.
 *
 * Vì sao cần ngay ở bước cài đặt: `companies.base_currency` là **đích đến của mọi
 * phép quy đổi ngoại tệ** (quyết định #3). Không có công ty nào thì hệ thống vẫn chạy
 * (rơi về `VND`), nhưng người dùng không có chỗ nào để đổi đơn vị tiền hạch toán.
 *
 * Idempotent: đã có công ty mặc định thì bỏ qua hoàn toàn.
 */
async function seedCompany(app: INestApplicationContext): Promise<void> {
  const companies = app.get(CompaniesService);

  const existing = await companies.findDefault();
  if (existing) {
    console.log(
      `ℹ️  Công ty mặc định đã tồn tại: ${existing.code} — ${existing.name} ` +
        `(tiền hạch toán: ${existing.baseCurrency}). Bỏ qua.`,
    );
    return;
  }

  const company = await companies.create({
    code: DEFAULT_COMPANY_CODE,
    name: 'Công ty của tôi',
    baseCurrency: DEFAULT_BASE_CURRENCY,
    isDefault: true,
    description: 'Công ty mặc định được tạo tự động khi cài đặt lần đầu',
  });

  console.log(
    `✅ Đã tạo công ty mặc định: ${company.code} — ${company.name} ` +
      `(tiền hạch toán: ${company.baseCurrency})`,
  );
}

/**
 * Mục 10.C.1 — danh mục tiền tệ nền.
 *
 * Chỉ tạo **danh mục** (VND, USD, EUR) chứ **không** tạo tỷ giá — xem
 * `seedSampleExchangeRates` để biết vì sao.
 */
async function seedCurrencies(app: INestApplicationContext): Promise<void> {
  const currencies = app.get(CurrenciesService);

  // Đồng bộ cờ `is_base` theo `companies.base_currency`, và tạo loại tiền hạch toán
  // nếu chưa có — bảo đảm chỉ đúng một loại tiền được đánh dấu là tiền hạch toán.
  const baseCurrency = await currencies.syncBaseFlag();
  console.log(`✅ Đơn vị tiền hạch toán: ${baseCurrency}`);

  const defaults = [
    { code: 'USD', name: 'Đô la Mỹ', decimals: 2 },
    { code: 'EUR', name: 'Euro', decimals: 2 },
  ] as const;

  for (const currency of defaults) {
    if (currency.code === baseCurrency) continue;
    try {
      await currencies.create(currency);
      console.log(`✅ Đã thêm loại tiền: ${currency.code} — ${currency.name}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(`ℹ️  Loại tiền ${currency.code} đã tồn tại — bỏ qua.`);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Mục 10.C.1 — tỷ giá mẫu, **chỉ khi được yêu cầu rõ ràng**.
 *
 * Vì sao không seed tỷ giá mặc định: một tỷ giá sai nhưng "trông hợp lệ" sẽ được
 * `JournalsService` dùng để kiểm tra quy đổi, và mọi bút toán ngoại tệ lập sau đó sẽ
 * mang số tiền sai **mà vẫn cân bằng** — không lá chắn nào phát hiện. Thà chặn bằng
 * lỗi "chưa có tỷ giá" (kèm hướng dẫn khai) còn hơn im lặng ghi sổ sai.
 *
 * Bật bằng biến môi trường:
 *   SEED_SAMPLE_FX_RATES=true pnpm seed
 */
async function seedSampleExchangeRates(
  app: INestApplicationContext,
): Promise<void> {
  if (process.env.SEED_SAMPLE_FX_RATES !== 'true') {
    console.log(
      'ℹ️  Bỏ qua tỷ giá mẫu. Khai tỷ giá thật qua POST /api/exchange-rates ' +
        '(hoặc chạy lại với SEED_SAMPLE_FX_RATES=true để tạo tỷ giá mẫu cho môi trường thử).',
    );
    return;
  }

  const rates = app.get(ExchangeRatesService);
  const today = new Date().toISOString().slice(0, 10);

  const samples = [
    { currency: 'USD', rate: '24500' },
    { currency: 'EUR', rate: '26500' },
  ] as const;

  console.log(
    '⚠️  Đang tạo TỶ GIÁ MẪU — đây KHÔNG phải tỷ giá thật, chỉ dùng cho môi trường thử.',
  );

  for (const sample of samples) {
    try {
      const saved = await rates.upsert({
        currency: sample.currency,
        rateDate: today,
        rate: sample.rate,
        source: 'seed-sample',
        note: 'Tỷ giá mẫu sinh bởi seed — phải thay bằng tỷ giá thật trước khi dùng',
      });
      console.log(
        `⚠️  Tỷ giá mẫu: 1 ${saved.currencyCode} = ${saved.rate} (ngày ${saved.rateDate})`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        console.log(
          `ℹ️  Bỏ qua tỷ giá mẫu cho ${sample.currency}: chưa có loại tiền này.`,
        );
        continue;
      }
      throw error;
    }
  }
}

/**
 * Mục 10.C.2 — danh mục mã thuế GTGT chuẩn.
 *
 * Vì sao **được phép** seed thuế suất (khác tỷ giá ở `seedSampleExchangeRates`): thuế
 * suất là **sự kiện pháp lý ổn định**, không phải số liệu thị trường đổi hằng ngày. Và
 * người dùng **chọn mã thuế theo dòng một cách tường minh** — họ nhìn thấy "VAT10" và
 * biết đó là 10%, nên một mã thừa không làm sai số liệu (khác tỷ giá, vốn được áp tự
 * động và âm thầm).
 *
 * Không gán tài khoản đích: để trống ⇒ rơi về tiền tố TT200 (3331 đầu ra / 1331 đầu
 * vào) qua `TaxCodesService.resolveVatAccount`. Nhờ vậy seed chạy được kể cả khi hệ
 * thống tài khoản chưa có 3331/1331 — chỉ tới lúc ghi sổ mới cần.
 *
 * ⚠️ Thuế suất 8% là mức **giảm tạm thời** theo nghị quyết của Quốc hội, có thời hạn.
 * Vẫn seed sẵn nhưng đánh dấu rõ trong mô tả để kế toán kiểm tra hiệu lực trước khi dùng.
 *
 * Idempotent: mã đã tồn tại thì bỏ qua — **không** ghi đè thuế suất người dùng đã sửa.
 */
async function seedTaxCodes(app: INestApplicationContext): Promise<void> {
  const taxes = app.get(TaxCodesService);

  const codes = [
    { code: 'VAT0', name: 'Thuế GTGT 0%', rate: '0', description: 'Hàng hóa, dịch vụ chịu thuế suất 0% (thường là xuất khẩu)' },
    { code: 'VAT5', name: 'Thuế GTGT 5%', rate: '5' },
    { code: 'VAT8', name: 'Thuế GTGT 8%', rate: '8', description: 'Mức giảm tạm thời theo nghị quyết — kiểm tra hiệu lực trước khi dùng' },
    { code: 'VAT10', name: 'Thuế GTGT 10%', rate: '10', description: 'Mức thuế suất phổ thông' },
    { code: 'KCT', name: 'Không chịu thuế GTGT', rate: '0', description: 'Đối tượng không thuộc diện chịu thuế GTGT' },
  ] as const;

  for (const item of codes) {
    try {
      const saved = await taxes.create({
        code: item.code,
        name: item.name,
        rate: item.rate,
        description: 'description' in item ? item.description : undefined,
      });
      console.log(`✅ Đã thêm mã thuế: ${saved.code} — ${saved.name} (${saved.rate}%)`);
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(`ℹ️  Mã thuế ${item.code} đã tồn tại — bỏ qua.`);
        continue;
      }
      throw error;
    }
  }
}

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await seedAdmin(app);
    await seedCompany(app);
    await seedCurrencies(app);
    await seedSampleExchangeRates(app);
    await seedAccountDefaults(app);
    await seedTaxCodes(app);
  } finally {
    await app.close();
  }
}

await seed();
