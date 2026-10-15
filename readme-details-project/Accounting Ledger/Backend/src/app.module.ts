import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';

import { AccountsModule } from './accounts/accounts.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditContextInterceptor } from './audit/audit-context.interceptor.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { VendorBillsModule } from './bills/vendor-bills.module.js';
import { CommonModule } from './common/common.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { FiscalPeriodsModule } from './fiscal-periods/fiscal-periods.module.js';
import { AllocationsModule } from './allocations/allocations.module.js';
import { SalesInvoicesModule } from './invoices/sales-invoices.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { JournalsModule } from './journals/journals.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { PartiesModule } from './parties/parties.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // 1. Environment configuration (global)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // 2. PostgreSQL via TypeORM
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'accounting_ledger'),
        // Money columns are stored as numeric/decimal to avoid float drift.
        autoLoadEntities: true,
        // Never enable synchronize in production: use migrations instead.
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),

    // 3. Cron / interval scheduling
    ScheduleModule.forRoot(),

    // 4. Redis-backed queue (BullMQ)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
    }),

    // 5. Application modules
    CommonModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    // Mục 10.0 — đối tượng (khách hàng / nhà cung cấp) cho sổ cái phụ.
    PartiesModule,
    SalesInvoicesModule,
    VendorBillsModule,
    // Mục 10.0 — phân bổ thanh toán giữa chứng từ đích và nguồn.
    AllocationsModule,
    LedgerModule,
    FiscalPeriodsModule,
    JournalsModule,
    ReportsModule,
    AuditModule,
    // Mục 9 — xử lý bất đồng bộ: hàng đợi BullMQ + lịch cron
    JobsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Thứ tự quan trọng: xác thực JWT trước, rồi mới kiểm tra vai trò.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Mở vùng nhớ AsyncLocalStorage để subscriber ghi vết biết "ai đang thao tác".
    // Guard chạy trước interceptor nên `req.user` đã có sẵn khi tới đây.
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
})
export class AppModule {}
