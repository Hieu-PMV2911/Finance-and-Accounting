import { Logger } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import type { JobPayloadBase } from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';

/**
 * Lấy id dòng `job_runs` của một job.
 *
 * Ưu tiên `jobRunId` trong payload (do `QueueService` tự gắn) vì có trường hợp
 * `jobId` của BullMQ **không** phải id lượt chạy — webhook dùng id dòng giao để
 * chống giao trùng. `job.id` chỉ là phương án dự phòng.
 */
export function jobRunIdOf(job: Job): string | null {
  const data = job.data as JobPayloadBase | undefined;
  if (data && typeof data.jobRunId === 'string' && data.jobRunId) {
    return data.jobRunId;
  }
  return typeof job.id === 'string' && job.id ? job.id : null;
}

/**
 * Lớp cơ sở cho mọi processor: **tự ghi vết lượt chạy** vào `job_runs`.
 *
 * Nhờ lớp này, các processor con chỉ tập trung vào nghiệp vụ (`handle`) mà
 * không phải lặp lại 4 bước giống nhau: đánh dấu `active` → chạy → `completed`,
 * hoặc ghi `failed` kèm số lần thử rồi **ném lỗi tiếp** để BullMQ retry theo
 * backoff.
 *
 * Việc cập nhật `job_runs` không bọc trong transaction của nghiệp vụ: đây là
 * bảng vận hành, mục đích là nhìn thấy được job chết ở đâu — nếu transaction
 * nghiệp vụ rollback thì vết "thất bại" mới là thông tin đúng.
 */
export abstract class TrackedWorkerHost extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(private readonly runs: JobRunsService) {
    super();
  }

  /** Nghiệp vụ của job. Trả về dữ liệu lưu vào `job_runs.result`. */
  protected abstract handle(
    job: Job,
    runId: string | null,
    attempt: number,
  ): Promise<Record<string, unknown> | null>;

  async process(job: Job): Promise<Record<string, unknown> | null> {
    const runId = jobRunIdOf(job);
    const attempt = (job.attemptsMade ?? 0) + 1;
    const maxAttempts = job.opts?.attempts ?? 1;

    if (runId) {
      await this.runs.markActive(runId, attempt);
    }

    try {
      const result = await this.handle(job, runId, attempt);
      if (runId) {
        await this.runs.markCompleted(runId, result, attempt);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (runId) {
        await this.runs.markFailed(runId, message, attempt, maxAttempts);
      }
      this.logger.error(
        `Job ${job.name} (${job.id ?? 'không rõ id'}) thất bại lần ${attempt}/${maxAttempts}: ${message}`,
      );
      throw error;
    }
  }
}
