import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { JobName, JobQueue, JobRunStatus, JobTrigger } from './enums/job.enum.js';
import type { JobRunsService } from './job-runs.service.js';
import { QueueService } from './queue.service.js';

const ACTOR: AuthUser = { id: 'u1', email: 'ketoan@example.com', roles: [] };

function makeQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    getJobCounts: vi.fn(),
    getJob: vi.fn(),
  };
}

function build() {
  const runs = { create: vi.fn(), findById: vi.fn() };
  const reports = makeQueue();
  const maintenance = makeQueue();
  const notifications = makeQueue();
  const webhooks = makeQueue();

  const service = new QueueService(
    runs as unknown as JobRunsService,
    reports as unknown as Queue,
    maintenance as unknown as Queue,
    notifications as unknown as Queue,
    webhooks as unknown as Queue,
  );

  return { service, runs, reports, maintenance, notifications, webhooks };
}

describe('QueueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueue tạo dòng job_runs rồi đẩy job với jobId = id lượt chạy', async () => {
    const { service, runs, maintenance } = build();
    runs.create.mockResolvedValue({ id: 'run-1' });

    const run = await service.enqueue({
      queue: JobQueue.MAINTENANCE,
      jobName: JobName.INTEGRITY_CHECK,
      payload: { periodId: 'p1' },
      trigger: JobTrigger.SCHEDULE,
    });

    expect(run).toEqual({ id: 'run-1' });
    expect(runs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: JobQueue.MAINTENANCE,
        jobName: JobName.INTEGRITY_CHECK,
        trigger: JobTrigger.SCHEDULE,
        payload: { periodId: 'p1' },
        // Bảo trì: 3 lần thử.
        maxAttempts: 3,
        actor: null,
      }),
    );

    expect(maintenance.add).toHaveBeenCalledWith(
      JobName.INTEGRITY_CHECK,
      { periodId: 'p1', jobRunId: 'run-1' },
      expect.objectContaining({
        jobId: 'run-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      }),
    );
  });

  it('cho phép ghi đè jobId (dùng cho webhook để chống giao trùng)', async () => {
    const { service, runs, webhooks } = build();
    runs.create.mockResolvedValue({ id: 'run-2' });

    await service.enqueue({
      queue: JobQueue.WEBHOOKS,
      jobName: JobName.DELIVER_WEBHOOK,
      trigger: JobTrigger.SYSTEM,
      payload: { deliveryId: 'delivery-1' },
      jobId: 'delivery-1',
      maxAttempts: 5,
    });

    expect(webhooks.add).toHaveBeenCalledWith(
      JobName.DELIVER_WEBHOOK,
      { deliveryId: 'delivery-1', jobRunId: 'run-2' },
      expect.objectContaining({ jobId: 'delivery-1', attempts: 5 }),
    );
  });

  it('chỉ đặt delay khi lớn hơn 0', async () => {
    const { service, runs, notifications } = build();
    runs.create.mockResolvedValue({ id: 'run-3' });

    await service.enqueue({
      queue: JobQueue.NOTIFICATIONS,
      jobName: JobName.SEND_NOTIFICATION,
      trigger: JobTrigger.SYSTEM,
      delayMs: 0,
    });

    const options = notifications.add.mock.calls[0][2] as Record<string, unknown>;
    expect(options).not.toHaveProperty('delay');
  });

  it('overview đọc số đếm từ Redis và chịu được hàng đợi không kết nối được', async () => {
    const { service, reports, maintenance } = build();
    maintenance.getJobCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      completed: 5,
      failed: 1,
      delayed: 0,
    });
    reports.getJobCounts.mockRejectedValue(new Error('redis down'));

    const overview = await service.overview();

    expect(overview).toHaveLength(4);

    const maintenanceView = overview.find((item) => item.queue === JobQueue.MAINTENANCE);
    expect(maintenanceView?.reachable).toBe(true);
    expect(maintenanceView?.counts).toEqual({
      waiting: 2,
      active: 1,
      completed: 5,
      failed: 1,
      delayed: 0,
      paused: 0,
    });

    const reportsView = overview.find((item) => item.queue === JobQueue.REPORTS);
    expect(reportsView?.reachable).toBe(false);
    expect(reportsView?.counts).toEqual({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    });
  });

  it('chỉ thử lại được job đã thất bại', async () => {
    const { service, runs } = build();
    runs.findById.mockResolvedValue({ id: 'run-9', status: JobRunStatus.COMPLETED });

    await expect(service.retry('run-9', ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('thử lại job đã thất bại ⇒ xếp lượt chạy mới từ payload đã lưu', async () => {
    const { service, runs, reports } = build();
    runs.findById.mockResolvedValue({
      id: 'run-9',
      status: JobRunStatus.FAILED,
      queue: JobQueue.REPORTS,
      jobName: JobName.GENERATE_REPORT,
      payload: { kind: 'balance-sheet' },
      maxAttempts: 2,
    });
    runs.create.mockResolvedValue({ id: 'run-10' });

    const created = await service.retry('run-9', ACTOR);

    expect(created).toEqual({ id: 'run-10' });
    expect(runs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: JobQueue.REPORTS,
        jobName: JobName.GENERATE_REPORT,
        payload: { kind: 'balance-sheet' },
        maxAttempts: 2,
        trigger: JobTrigger.API,
        actor: ACTOR,
      }),
    );
    expect(reports.add).toHaveBeenCalledWith(
      JobName.GENERATE_REPORT,
      { kind: 'balance-sheet', jobRunId: 'run-10' },
      expect.objectContaining({ attempts: 2 }),
    );
  });
});
