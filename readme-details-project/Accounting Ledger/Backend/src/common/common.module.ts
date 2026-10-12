import { Global, Module } from '@nestjs/common';

import { PasswordService } from './services/password.service.js';

/**
 * Tiện ích dùng chung toàn hệ thống (global, không cần import lại).
 */
@Global()
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class CommonModule {}
