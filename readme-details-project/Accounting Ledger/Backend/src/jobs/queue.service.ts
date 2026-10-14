import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import type { JobRun } from './entities/job-run.entity.js';
import {
  ALL_JOB_QUEUES,
  JOB_QUEUE_LABELS,
  JobQueue,
  JobRunStatus,
  JobTrigger,
} from './enums/job.enum.js';
import type { JobName } from './enums/job.enum.js';
import type { QueueCounts, QueueOverview } from './interfaces/job-view.interface.js';
import { JobRunsService } from './job-runs.service.js';

export interface EnqueueJobInput {
  queue: JobQueue;
  jobName: JobName | string;
  payload?: Record<string, unknown> | null;
  trigger: JobTrigger;
  actor?: AuthUser | null;
  maxAttempts?: number;
  delayMs?: number;
  /**
   * Ghi đè `jobId` của BullMQ. Mặc định là id dòng `job_runs` (nhờ vậy chống
   * trùng theo lượt chạy). Webhook dùng id dòng giao để chống **giao trùng**.
   */
  jobId?: string;
}

/** Số lần thử mặc định theo tính chất công việc. */
const DEFAULT_ATTEMPTS: Record<JobQueue, number> = {
  [JobQueue.REPORTS]: 2,
  [JobQueue.MAINTENANCE]: 3,
  [JobQueue.NOTIFICATIONS]: 5,
  [JobQueue.WEBHOOKS]: 5,
};

/** Độ trễ backoff cơ sở (ms) — BullMQ nhân dần theo cấp số nhân. */
const BACKOFF_DELAY: Record<JobQueue, number> = {
  [JobQueue.REPORTS]: 5_000,
  [JobQueue.MAINTENANCE]: 10_000,
  [JobQueue.NOTIFICATIONS]: 2_000,
  [JobQueue.WEBHOOKS]: 3_000,
};

const EMPTY_COUNTS: QueueCounts = {
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
};

/**
 * Cổng duy nhất để đẩy job vào BullMQ (mục 9).
 *
 * Mọi job **luôn** đi kèm một dòng `job_runs`; `jobId` của BullMQ chính là id
 * dòng đó, nên worker tra ngược được trạng thái mà không cần thêm bảng ánh xạ.
 * Nhờ vậy giao diện "Xử lý bất đồng bộ" đọc được đúng thứ người dùng cần, và
 * nút "Thử lại" chỉ là enqueue lại từ payload đã lưu.
 */
@Injectable()
export class QueueService {
  private readonly queues: Map<JobQueue, Queue>;

  constructor(
    private readonly runs: JobRunsService,
    @InjectQueue(JobQueue.REPORTS) reportsQueue: Queue,
    @InjectQueue(JobQueue.MAINTENANCE) maintenanceQueue: Queue,
    @InjectQueue(JobQueue.NOTIFICATIONS) notificationsQueue: Queue,
    @InjectQueue(JobQueue.WEBHOOKS) webhooksQueue: Queue,
  ) {
    this.queues = new Map<JobQueue, Queue>([
      [JobQueue.REPORTS, reportsQueue],
      [JobQueue.MAINTENANCE, maintenanceQueue],
      [JobQueue.NOTIFICATIONS, notificationsQueue],
      [JobQueue.WEBHOOKS, webhooksQueue],
    ]);
  }

  queueOf(queue: JobQueue): Queue {
    const found = this.queues.get(queue);
    if (!found) {
      throw new BadRequestException(`Hàng đợi "${queue}" không tồn tại`);
    }
    return found;
  }

  /**
   * Đẩy một job vào hàng đợi và ghi ngay một dòng `job_runs` trạng thái `pending`.
   *
   * `jobId` = id dòng `job_runs` ⇒ worker biết cập nhật vào đâu; đồng thời BullMQ
   * bảo đảm không tạo job trùng id.
   */
  async enqueue(input: EnqueueJobInput): Promise<JobRun> {
    const maxAttempts = input.maxAttempts ?? DEFAULT_ATTEMPTS[input.queue];

    const run = await this.runs.create({
      queue: input.queue,
      jobName: input.jobName,
      payload: input.payload ?? null,
      trigger: input.trigger,
      maxAttempts,
      actor: input.actor ?? null,
    });

    await this.queueOf(input.queue).add(
      input.jobName,
      { ...input.payload, jobRunId: run.id },
      {
        jobId: input.jobId ?? run.id,
        attempts: maxAttempts,
        backoff: { type: 'exponential', delay: BACKOFF_DELAY[input.queue] },
        // Giữ lại một số job gần nhất để còn xem được lịch sử bên phía BullMQ.
        removeOnComplete: { age: 60 * 60 * 24, count: 500 },
        removeOnFail: { age: 60 * 60 * 24 * 7, count: 1000 },
        ...(input.delayMs && input.delayMs > 0 ? { delay: input.delayMs } : {}),
      },
    );

    return run;
  }

  /**
   * Tình trạng các hàng đợi — đọc **trực tiếp từ Redis**.
   *
   * Redis chết không được làm sập API giám sát: khi đó `reachable = false` và
   * các số đếm bằng 0, giao diện vẫn hiển thị được lịch sử job đã lưu trong DB.
   */
  async overview(): Promise<QueueOverview[]> {
    return Promise.all(
      ALL_JOB_QUEUES.map(async (queueName) => {
        const queue = this.queueOf(queueName);
        try {
          const counts = await queue.getJobCounts();
          return {
            queue: queueName,
            label: JOB_QUEUE_LABELS[queueName],
            reachable: true,
            counts: {
              waiting: counts.waiting ?? 0,
              active: counts.active ?? 0,
              completed: counts.completed ?? 0,
              failed: counts.failed ?? 0,
              delayed: counts.delayed ?? 0,
              paused: counts.paused ?? 0,
            },
          } satisfies QueueOverview;
        } catch {
          return {
            queue: queueName,
            label: JOB_QUEUE_LABELS[queueName],
            reachable: false,
            counts: { ...EMPTY_COUNTS },
          } satisfies QueueOverview;
        }
      }),
    );
  }

  /**
   * Chạy lại một job đã thất bại.
   *
   * Cố tình **không** dùng `job.retry()` của BullMQ: tạo lượt chạy mới giữ được
   * vết cũ (job nào lỗi, lỗi gì), và payload lấy từ `job_runs` nên thử lại được
   * cả khi job đã bị dọn khỏi Redis.
   */
  async retry(runId: string, actor: AuthUser): Promise<JobRun> {
    const run = await this.runs.findById(runId);
    if (run.status !== JobRunStatus.FAILED) {
      throw new BadRequestException(
        'Chỉ thử lại được job đang ở trạng thái thất bại',
      );
    }

    return this.enqueue({
      queue: run.queue,
      jobName: run.jobName,
      payload: run.payload,
      trigger: JobTrigger.API,
      maxAttempts: run.maxAttempts,
      actor,
    });
  }
}
