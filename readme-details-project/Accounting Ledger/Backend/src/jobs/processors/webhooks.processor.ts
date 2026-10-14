import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { JobName, JobQueue } from '../enums/job.enum.js';
import type { DeliverWebhookPayload } from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { WebhooksService } from '../webhooks.service.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/**
 * Giao webhook ra hệ thống ngoài (mục 9 — "webhook + retry").
 *
 * Worker này **cố tình ném lỗi** khi endpoint trả về lỗi hoặc không gọi được:
 * đó là cách nói với BullMQ "hãy thử lại theo backoff". Trạng thái từng lần thử
 * (số lần, mã HTTP, body trả về, lỗi, thời điểm thử kế tiếp) được
 * `WebhooksService` ghi vào `webhook_deliveries`, nên retry vẫn **bền** qua
 * restart và người vận hành nhìn thấy được cái gì đang kẹt.
 */
@Processor(JobQueue.WEBHOOKS)
export class WebhooksProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly webhooks: WebhooksService,
  ) {
    super(runs);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    if (job.name !== JobName.DELIVER_WEBHOOK) {
      throw new Error(`Job "${job.name}" không được hỗ trợ ở hàng đợi webhook`);
    }

    const payload = job.data as DeliverWebhookPayload;
    const result = await this.webhooks.deliverOne(payload.deliveryId);

    return {
      deliveryId: payload.deliveryId,
      delivered: result.delivered,
      responseStatus: result.responseStatus,
      skippedReason: result.skippedReason,
    };
  }
}
