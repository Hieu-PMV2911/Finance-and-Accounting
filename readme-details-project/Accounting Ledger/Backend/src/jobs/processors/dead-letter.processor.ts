import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { JobName, JobQueue } from '../enums/job.enum.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../enums/notification.enum.js';
import type { DeadLetterArchivePayload } from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { NotificationsService } from '../notifications.service.js';
import { QueueService } from '../queue.service.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/**
 * Hàng đợi **thư chết** (hoàn tất hạng mục ⏳ của mục 9).
 *
 * Worker này **không** làm lại nghiệp vụ — nó chỉ *ghi nhận*: một job đã hết số
 * lần thử thì cần con người nhìn vào, chứ tự chạy lại lần thứ sáu chỉ tạo thêm
 * tiếng ồn. Việc duy nhất của nó là tạo thông báo cho quản trị kèm đủ ngữ cảnh để
 * biết **job nào, hàng đợi nào, lỗi gì**.
 *
 * `TrackedWorkerHost` đã chặn việc lưu thư chết vào chính hàng đợi này, nên không
 * có vòng lặp vô hạn.
 */
@Processor(JobQueue.DEAD_LETTER)
export class DeadLetterProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly notifications: NotificationsService,
    queue: QueueService,
  ) {
    super(runs, queue);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    if (job.name !== JobName.DEAD_LETTER_ARCHIVE) {
      throw new Error(`Job "${job.name}" không được hỗ trợ ở hàng đợi thư chết`);
    }

    const payload = job.data as DeadLetterArchivePayload;

    await this.notifications.create({
      type: NotificationType.SYSTEM,
      severity: NotificationSeverity.CRITICAL,
      audience: NotificationAudience.ADMIN,
      title: `Job thất bại vĩnh viễn: ${payload.sourceJobName}`,
      body: [
        `Hàng đợi: ${payload.sourceQueue}`,
        `Tên job: ${payload.sourceJobName}`,
        `Số lần đã thử: ${payload.attempts}`,
        `Lỗi: ${payload.error}`,
        payload.sourceRunId ? `Lượt chạy: ${payload.sourceRunId}` : '',
        'Job đã được chuyển vào hàng đợi thư chết và sẽ KHÔNG tự chạy lại — cần xử lý bằng tay.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      data: {
        sourceQueue: payload.sourceQueue,
        sourceJobName: payload.sourceJobName,
        sourceRunId: payload.sourceRunId,
        attempts: payload.attempts,
      },
    });

    return {
      archived: true,
      sourceQueue: payload.sourceQueue,
      sourceJobName: payload.sourceJobName,
      sourceRunId: payload.sourceRunId,
    };
  }
}
