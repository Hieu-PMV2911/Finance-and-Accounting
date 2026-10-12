import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
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
async function seed(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
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
  } finally {
    await app.close();
  }
}

await seed();
