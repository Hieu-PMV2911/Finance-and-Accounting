import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { AccountDefaultsController } from './account-defaults.controller.js';
import { AccountDefaultsService } from './account-defaults.service.js';
import { AccountDefaultRule } from './entities/account-default-rule.entity.js';

/**
 * Mục 10.A — luật mặc định tài khoản (quyết định #1 của `MUC-10-TIEP-THEO.md`).
 *
 * `AccountDefaultsService` được export để hóa đơn bán/mua dùng lại khi lập chứng từ,
 * và để `seed.ts` khai luật nền lúc khởi tạo hệ thống.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountDefaultRule]), AccountsModule],
  controllers: [AccountDefaultsController],
  providers: [AccountDefaultsService],
  exports: [AccountDefaultsService],
})
export class AccountDefaultsModule {}
