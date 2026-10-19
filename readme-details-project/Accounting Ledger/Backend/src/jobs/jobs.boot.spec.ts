import { connect } from 'node:net';

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it } from 'vitest';

import { Account } from '../accounts/entities/account.entity.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalEntry } from '../journals/entities/journal-entry.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';
import { AccountBalance } from '../ledger/entities/account-balance.entity.js';
import { JobRun } from './entities/job-run.entity.js';
import { Notification } from './entities/notification.entity.js';
import { WebhookDelivery } from './entities/webhook-delivery.entity.js';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { JobQueue } from './enums/job.enum.js';
import { JobsModule } from './jobs.module.js';
import { JobsScheduler } from './jobs.scheduler.js';
import { MaintenanceProcessor } from './processors/maintenance.processor.js';
import { NotificationsProcessor } from './processors/notifications.processor.js';
import { PaymentsProcessor } from './processors/payments.processor.js';
import { ReportsProcessor } from './processors/reports.processor.js';
import { StatementsProcessor } from './processors/statements.processor.js';
import { WebhooksProcessor } from './processors/webhooks.processor.js';
import { QueueService } from './queue.service.js';

/**
 * Test **khởi động thật** của module mục 9.
 *
 * Build xanh không chứng minh được gì ở tầng runtime: DI thiếu provider, hoặc
 * `@Processor` không tạo được worker, chỉ lộ ra khi container thật sự khởi tạo.
 * Test này dựng `JobsModule` với **Redis thật** (worker cần Redis để chạy) nhưng
 * repository là mock (không cần PostgreSQL), rồi xác nhận:
 * - container resolve được `QueueService` / `JobsScheduler`;
 * - cả 4 processor đều đã có `worker` (nghĩa là BullMQ đã nhận job);
 * - token hàng đợi của `queueOf()` đúng như khai báo.
 *
 * Redis không có ⇒ bỏ qua (skip) chứ không fail: môi trường CI không bắt buộc
 * phải có Redis để chạy bộ unit test.
 */
async function redisReachable(
  host = process.env.REDIS_HOST ?? 'localhost',
  port = Number(process.env.REDIS_PORT ?? 6379),
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(700);
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
    socket.once('timeout', () => settle(false));
  });
}

const hasRedis = await redisReachable();

/** `@InjectDataSource()` cần token `DataSource` — thay bằng stub toàn cục. */
@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken(),
      useValue: { subscribers: [], query: async () => [] },
    },
  ],
  exports: [getDataSourceToken()],
})
class StubDataSourceModule {}

describe.skipIf(!hasRedis)('JobsModule boot (cần Redis)', () => {
  it('DI đầy đủ, 4 worker BullMQ sẵn sàng và token hàng đợi đúng', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: Number(process.env.REDIS_PORT ?? 6379),
          },
        }),
        StubDataSourceModule,
        JobsModule,
      ],
    })
      .overrideProvider(getRepositoryToken(JobRun))
      .useValue({})
      .overrideProvider(getRepositoryToken(Notification))
      .useValue({})
      .overrideProvider(getRepositoryToken(WebhookEndpoint))
      .useValue({})
      .overrideProvider(getRepositoryToken(WebhookDelivery))
      .useValue({})
      .overrideProvider(getRepositoryToken(WebhookEvent))
      .useValue({})
      .overrideProvider(getRepositoryToken(JournalLine))
      .useValue({})
      .overrideProvider(getRepositoryToken(Account))
      .useValue({})
      .overrideProvider(getRepositoryToken(FiscalPeriod))
      .useValue({})
      .overrideProvider(getRepositoryToken(AccountBalance))
      .useValue({})
      .overrideProvider(getRepositoryToken(JournalEntry))
      .useValue({})
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const queueService = moduleRef.get(QueueService);
    expect(queueService).toBeInstanceOf(QueueService);
    expect(moduleRef.get(JobsScheduler)).toBeInstanceOf(JobsScheduler);

    for (const processor of [
      ReportsProcessor,
      MaintenanceProcessor,
      NotificationsProcessor,
      WebhooksProcessor,
      PaymentsProcessor,
      StatementsProcessor,
    ]) {
      const instance = moduleRef.get(processor) as { worker?: unknown };
      expect(
        instance.worker,
        `${processor.name} chưa được gắn worker`,
      ).toBeDefined();
    }

    for (const queue of Object.values(JobQueue)) {
      expect(queueService.queueOf(queue).name).toBe(queue);
    }

    await app.close();
  });
});
