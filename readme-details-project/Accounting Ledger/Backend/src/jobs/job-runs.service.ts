import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type QueryDeepPartialEntity } from 'typeorm';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import type { QueryJobRunsDto } from './dto/query-job-runs.dto.js';
import { JobRun } from './entities/job-run.entity.js';
import { JobRunStatus, JobTrigger } from './enums/job.enum.js';
import type { JobQueue } from './enums/job.enum.js';
import type { JobRunView } from './interfaces/job-view.interface.js';

export interface CreateJobRunInput {
  queue: JobQueue;
  jobName: string;
  payload: Record<string, unknown> | null;
  trigger: JobTrigger;
  maxAttempts: number;
  actor?: AuthUser | null;
}

/**
 * Lịch sử chạy job (mục 9).
 *
 * Là **sổ ghi** của mọi lượt chạy: mỗi lần enqueue tạo một dòng `pending`, worker
 * cập nhật dần sang `active` rồi `completed`/`failed`. Nhờ vậy trạng thái job
 * không nằm trong bộ nhớ tiến trình (restart vẫn còn) và giao diện có dữ liệu
 * thật để hiển thị, thay vì phải hỏi BullMQ rồi ghép các mảnh rời rạc.
 *
 * Khi job thất bại mà **còn lượt thử**, dòng quay về `pending` kèm thông điệp
 * lỗi — giao diện thấy được "đang chờ thử lại lần 2/3".
 */
@Injectable()
export class JobRunsService {
  constructor(
    @InjectRepository(JobRun)
    private readonly runs: Repository<JobRun>,
  ) {}

  async create(input: CreateJobRunInput): Promise<JobRun> {
    const run = this.runs.create({
      queue: input.queue,
      jobName: input.jobName,
      payload: input.payload,
      trigger: input.trigger,
      status: JobRunStatus.PENDING,
      maxAttempts: input.maxAttempts,
      attempts: 0,
      progress: 0,
      triggeredBy: input.actor?.id ?? null,
      triggeredByEmail: input.actor?.email ?? null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      result: null,
      error: null,
    });

    return this.runs.save(run);
  }

  async findById(id: string): Promise<JobRun> {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException('Không tìm thấy lượt chạy job');
    }
    return run;
  }

  async list(query: QueryJobRunsDto = {}): Promise<JobRun[]> {
    const qb = this.runs
      .createQueryBuilder('run')
      .orderBy('run.createdAt', 'DESC')
      .take(query.limit ?? 50)
      .skip(query.offset ?? 0);

    if (query.queue) qb.andWhere('run.queue = :queue', { queue: query.queue });
    if (query.status) qb.andWhere('run.status = :status', { status: query.status });
    if (query.trigger) qb.andWhere('run.trigger = :trigger', { trigger: query.trigger });
    if (query.jobName) qb.andWhere('run.jobName = :jobName', { jobName: query.jobName });
    if (query.triggeredBy) {
      qb.andWhere('run.triggeredBy = :triggeredBy', { triggeredBy: query.triggeredBy });
    }

    return qb.getMany();
  }

  /** Đếm nhanh theo trạng thái — dùng cho thẻ thống kê trên giao diện. */
  async countByStatus(): Promise<Record<JobRunStatus, number>> {
    const rows = await this.runs
      .createQueryBuilder('run')
      .select('run.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('run.status')
      .getRawMany<{ status: JobRunStatus; count: string }>();

    const counts = {
      [JobRunStatus.PENDING]: 0,
      [JobRunStatus.ACTIVE]: 0,
      [JobRunStatus.COMPLETED]: 0,
      [JobRunStatus.FAILED]: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  /** Lượt chạy gần nhất của một cặp (hàng đợi, tên job) — phục vụ bảng lịch định kỳ. */
  async latestOf(queue: JobQueue, jobName: string): Promise<JobRun | null> {
    return this.runs.findOne({
      where: { queue, jobName },
      order: { createdAt: 'DESC' },
    });
  }

  // ------------------------------------------------------------ vòng đời

  async markActive(id: string, attempt: number): Promise<void> {
    await this.runs.update(
      { id },
      {
        status: JobRunStatus.ACTIVE,
        startedAt: new Date(),
        attempts: attempt,
        error: null,
      },
    );
  }

  async setProgress(id: string, progress: number): Promise<void> {
    const bounded = Math.max(0, Math.min(100, Math.round(progress)));
    await this.runs.update({ id }, { progress: bounded });
  }

  async markCompleted(
    id: string,
    result: Record<string, unknown> | null,
    attempt: number,
  ): Promise<void> {
    const run = await this.runs.findOne({ where: { id } });
    const finishedAt = new Date();
    await this.runs.update(
      { id },
      // Cột `jsonb` không mô tả được bằng `_QueryDeepPartialEntity` (nó map theo
      // `keyof` nên với `Record<string, unknown>` sẽ ra kiểu rỗng) — ép kiểu như
      // `AuditSubscriber` đang làm khi ghi vết.
      {
        status: JobRunStatus.COMPLETED,
        result,
        error: null,
        progress: 100,
        attempts: attempt,
        finishedAt,
        durationMs: run?.startedAt
          ? finishedAt.getTime() - run.startedAt.getTime()
          : null,
      } as unknown as QueryDeepPartialEntity<JobRun>,
    );
  }

  /**
   * Ghi nhận thất bại.
   *
   * Còn lượt thử ⇒ trả về `pending` (BullMQ sẽ chạy lại theo backoff); hết lượt
   * ⇒ `failed` vĩnh viễn, GIỮ NGUYÊN payload để người dùng bấm "Thử lại".
   */
  async markFailed(
    id: string,
    error: string,
    attempt: number,
    maxAttempts: number,
  ): Promise<void> {
    const exhausted = attempt >= maxAttempts;
    const run = await this.runs.findOne({ where: { id } });
    await this.runs.update(
      { id },
      {
        status: exhausted ? JobRunStatus.FAILED : JobRunStatus.PENDING,
        error: error.slice(0, 4000),
        attempts: attempt,
        maxAttempts,
        finishedAt: exhausted ? new Date() : null,
        durationMs:
          exhausted && run?.startedAt
            ? Date.now() - run.startedAt.getTime()
            : null,
      },
    );
  }

  toView(run: JobRun): JobRunView {
    return {
      id: run.id,
      queue: run.queue,
      jobName: run.jobName,
      status: run.status,
      trigger: run.trigger,
      triggeredBy: run.triggeredBy,
      triggeredByEmail: run.triggeredByEmail,
      payload: run.payload,
      result: run.result,
      error: run.error,
      attempts: run.attempts,
      maxAttempts: run.maxAttempts,
      progress: run.progress,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      durationMs: run.durationMs,
      createdAt: run.createdAt.toISOString(),
    };
  }
}
