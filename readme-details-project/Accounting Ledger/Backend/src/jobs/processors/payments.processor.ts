import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { JobName, JobQueue } from '../enums/job.enum.js';
import type { PaymentStatusPollPayload } from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { PaymentPollRegistry } from '../payment-poll.registry.js';
import { QueueService } from '../queue.service.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/**
 * Worker hàng đợi `payments` (mục 10.B — P2.1).
 *
 * Chỉ một việc: tra cứu lại các giao dịch chưa có kết luận. Việc quyết định
 * trạng thái/ghi sổ/leo thang nằm trong `PaymentIntentsService` — worker không
 * được tự diễn giải kết quả provider.
 *
 * Gọi qua `PaymentPollRegistry` thay vì inject trực tiếp service thanh toán để
 * tránh vòng phụ thuộc module (`PaymentIntentsModule → JobsModule`).
 */
@Processor(JobQueue.PAYMENTS)
export class PaymentsProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    queues: QueueService,
    private readonly polls: PaymentPollRegistry,
  ) {
    super(runs, queues);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    switch (job.name) {
      case JobName.PAYMENT_STATUS_POLL: {
        const payload = job.data as PaymentStatusPollPayload;
        const summary = await this.polls.poll(payload.limit ?? 50);
        return { ...summary };
      }
      default:
        throw new Error(
          `Job "${job.name}" không được hỗ trợ ở hàng đợi thanh toán`,
        );
    }
  }
}
