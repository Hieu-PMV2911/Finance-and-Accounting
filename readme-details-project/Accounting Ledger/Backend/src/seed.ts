import type { INestApplicationContext } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
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

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await seedAdmin(app);
    await seedAccountDefaults(app);
  } finally {
    await app.close();
  }
}

await seed();
