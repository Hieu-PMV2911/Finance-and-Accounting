import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { JobName, JobQueue } from '../jobs/enums/job.enum.js';
import type { PaymentStatusPollPayload } from '../jobs/interfaces/job-payload.interface.js';
import { JobRunsService } from '../jobs/job-runs.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { TrackedWorkerHost } from '../jobs/processors/tracked-worker-host.js';
import { PaymentIntentsService } from './payment-intents.service.js';

/**
 * Worker của hàng đợi **`payments`** (mục 10.B) — hàng đợi thứ 5.
 *
 * Một job duy nhất: `payment-status-poll`.
 * - Không có `intentId` ⇒ quét **mọi** intent chưa kết luận (cron 2 phút).
 * - Có `intentId` ⇒ chỉ tra cứu đúng intent đó (người dùng bấm "tra cứu lại").
 *
 * Worker này là nơi câu *"timeout không đồng nghĩa thất bại"* được thực thi: nó
 * **không** bao giờ suy diễn kết quả, chỉ hỏi provider và áp dụng câu trả lời.
 * Thất bại của chính job (vd Redis lỗi) vẫn được retry theo backoff của hàng đợi.
 */
@Processor(JobQueue.PAYMENTS)
export class PaymentsProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly intents: PaymentIntentsService,
    queue: QueueService,
  ) {
    super(runs, queue);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    if (job.name !== JobName.PAYMENT_STATUS_POLL) {
      throw new Error(`Job "${job.name}" không được hỗ trợ ở hàng đợi thanh toán`);
    }

    const payload = job.data as PaymentStatusPollPayload;

    if (payload.intentId) {
      const intent = await this.intents.refresh(payload.intentId);
      const settled = await this.intents.settleFromStatements();
      return {
        mode: 'single',
        intentId: intent.id,
        code: intent.code,
        status: intent.status,
        attempts: intent.attempts,
        journalEntryId: intent.journalEntryId,
        settled,
      };
    }

    const summary = await this.intents.pollPending();
    return { mode: 'sweep', ...summary };
  }
}
