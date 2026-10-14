import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import type { JobRun } from './entities/job-run.entity.js';
import { JobName, JobQueue, JobTrigger } from './enums/job.enum.js';
import type { JobRunStatus } from './enums/job.enum.js';
import type { ScheduleView } from './interfaces/job-view.interface.js';
import { JobRunsService } from './job-runs.service.js';
import { QueueService } from './queue.service.js';
import { nextCronRun } from './utils/cron.util.js';

/** Một lịch định kỳ: chạy khi nào, đẩy job gì, tham số gì. */
export interface ScheduleDefinition {
  name: string;
  label: string;
  description: string;
  /** Biểu thức cron 5 trường (dùng cho cả `@Cron` và tính `nextRunAt`). */
  cron: string;
  queue: JobQueue;
  jobName: JobName;
  payload: Record<string, unknown>;
}

/**
 * Biểu thức cron dùng chung giữa `JobsScheduler` (nơi thật sự chạy) và
 * `SchedulesService` (nơi hiển thị). Khai báo một chỗ để hai bên không lệch.
 *
 * Giờ chạy tính theo **giờ hệ thống** của server.
 */
export const BALANCE_SNAPSHOT_CRON = '0 1 * * *';
export const INTEGRITY_CHECK_CRON = '30 2 * * *';
export const DEBT_REMINDER_CRON = '0 8 * * 1';
export const WEBHOOK_SWEEP_CRON = '*/5 * * * *';

export const SCHEDULE_DEFINITIONS: readonly ScheduleDefinition[] = [
  {
    name: 'balance-snapshot',
    label: 'Chốt số dư cuối ngày',
    description:
      'Tái lập số dư mọi tài khoản của kỳ đang mở từ bút toán và đối chiếu với bảng số dư. Mặc định chỉ báo cáo, không tự sửa.',
    cron: BALANCE_SNAPSHOT_CRON,
    queue: JobQueue.MAINTENANCE,
    jobName: JobName.BALANCE_SNAPSHOT,
    payload: { repair: false },
  },
  {
    name: 'integrity-check',
    label: 'Kiểm tra bất biến',
    description:
      'Chạy 7 kiểm tra bất biến (Σ Nợ = Σ Có, số dư tái lập được, kỳ bị đóng băng, dòng mồ côi…). Có vi phạm sẽ phát cảnh báo.',
    cron: INTEGRITY_CHECK_CRON,
    queue: JobQueue.MAINTENANCE,
    jobName: JobName.INTEGRITY_CHECK,
    payload: {},
  },
  {
    name: 'debt-reminder',
    label: 'Nhắc công nợ',
    description:
      'Tổng hợp số dư tài khoản công nợ (131 phải thu, 331 phải trả) và tạo thông báo nhắc nhở.',
    cron: DEBT_REMINDER_CRON,
    queue: JobQueue.NOTIFICATIONS,
    jobName: JobName.DEBT_REMINDER,
    payload: {},
  },
  {
    name: 'webhook-retry-sweep',
    label: 'Quét webhook treo',
    description:
      'Tìm các lần giao webhook còn chờ nhưng mất job trong hàng đợi (do restart) rồi đẩy lại.',
    cron: WEBHOOK_SWEEP_CRON,
    queue: JobQueue.MAINTENANCE,
    jobName: JobName.WEBHOOK_SWEEP,
    payload: {},
  },
];

/**
 * Danh mục **lịch định kỳ** (mục 9 — `@nestjs/schedule`).
 *
 * Việc chạy thật do `JobsScheduler` đảm nhiệm qua `@Cron`; service này là **một
 * nguồn sự thật** về danh mục lịch: mô tả, biểu thức cron, lần chạy gần nhất
 * (đọc từ `job_runs`) và lần chạy kế tiếp — đồng thời cho phép **chạy ngay**
 * bằng tay để không phải chờ tới mốc cron.
 */
@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);
  private readonly enabled = process.env.JOBS_SCHEDULER_ENABLED !== 'false';

  constructor(
    private readonly queue: QueueService,
    private readonly runs: JobRunsService,
  ) {}

  /** Lịch định kỳ đang bật hay không (`JOBS_SCHEDULER_ENABLED=false` để tắt). */
  get schedulingEnabled(): boolean {
    return this.enabled;
  }

  async list(): Promise<ScheduleView[]> {
    return Promise.all(
      SCHEDULE_DEFINITIONS.map(async (definition) => {
        const last = await this.runs.latestOf(definition.queue, definition.jobName);
        return {
          name: definition.name,
          label: definition.label,
          description: definition.description,
          cron: definition.cron,
          queue: definition.queue,
          jobName: definition.jobName,
          lastRunAt: last ? last.createdAt.toISOString() : null,
          lastStatus: (last?.status ?? null) as JobRunStatus | null,
          nextRunAt: nextCronRun(definition.cron)?.toISOString() ?? null,
        } satisfies ScheduleView;
      }),
    );
  }

  /** Kích hoạt một lịch bằng tay (API). */
  async trigger(name: string, actor: AuthUser): Promise<JobRun> {
    return this.enqueue(name, JobTrigger.API, actor);
  }

  /**
   * Chạy một lịch theo cron.
   *
   * Nuốt lỗi và ghi log: cron không được phép làm sập tiến trình, còn dấu vết
   * thất bại đã nằm trong `job_runs` (job tự ghi khi worker xử lý).
   */
  async runScheduled(name: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.enqueue(name, JobTrigger.SCHEDULE, null);
    } catch (error) {
      this.logger.error(
        `Không xếp được lịch "${name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async enqueue(
    name: string,
    trigger: JobTrigger,
    actor: AuthUser | null,
  ): Promise<JobRun> {
    const definition = SCHEDULE_DEFINITIONS.find((item) => item.name === name);
    if (!definition) {
      throw new NotFoundException(`Không có lịch định kỳ nào tên "${name}"`);
    }

    return this.queue.enqueue({
      queue: definition.queue,
      jobName: definition.jobName,
      payload: definition.payload,
      trigger,
      actor,
    });
  }
}
