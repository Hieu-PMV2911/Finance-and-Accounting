import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { BalanceSnapshotService } from '../balance-snapshot.service.js';
import { JobName, JobQueue } from '../enums/job.enum.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../enums/notification.enum.js';
import { WebhookEventType } from '../enums/webhook.enum.js';
import { IntegrityService } from '../integrity.service.js';
import type {
  BalanceSnapshotPayload,
  IntegrityCheckPayload,
  WebhookSweepPayload,
} from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { NotificationsService } from '../notifications.service.js';
import { QueueService } from '../queue.service.js';
import { WebhooksService } from '../webhooks.service.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/**
 * Job bảo trì định kỳ (mục 9): **chốt số dư**, **kiểm tra bất biến**, quét
 * webhook treo.
 *
 * Ba việc này đều "không phải việc của người dùng": chúng quét dữ liệu, so
 * sánh, và chỉ lên tiếng khi phát hiện bất thường. Vì vậy chúng chạy nền theo
 * lịch, và mỗi lần chạy đều để lại một dòng `job_runs` + (khi cần) một thông
 * báo cho quản trị.
 *
 * Phát hiện vi phạm bất biến còn được phát ra ngoài qua webhook
 * `integrity.violation` — nền tảng để cảnh báo sang hệ thống giám sát khác.
 */
@Processor(JobQueue.MAINTENANCE)
export class MaintenanceProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly integrity: IntegrityService,
    private readonly snapshots: BalanceSnapshotService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly queue: QueueService,
  ) {
    super(runs, queue);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    switch (job.name) {
      case JobName.INTEGRITY_CHECK:
        return this.runIntegrityCheck(job);
      case JobName.BALANCE_SNAPSHOT:
        return this.runBalanceSnapshot(job);
      case JobName.WEBHOOK_SWEEP:
        return this.runWebhookSweep(job);
      default:
        throw new Error(`Job "${job.name}" không được hỗ trợ ở hàng đợi bảo trì`);
    }
  }

  // --------------------------------------------------- kiểm tra bất biến

  private async runIntegrityCheck(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as IntegrityCheckPayload;
    const result = await this.integrity.run(payload.periodId ?? null);

    if (!result.passed) {
      await this.notifications.create({
        type: NotificationType.INTEGRITY_ALERT,
        severity: NotificationSeverity.CRITICAL,
        audience: NotificationAudience.ADMIN,
        title: `Phát hiện ${result.violationCount} vi phạm bất biến`,
        body: result.violations
          .slice(0, 10)
          .map((violation) => `• [${violation.code}] ${violation.message}`)
          .join('\n'),
        data: {
          checkedAt: result.checkedAt,
          periodCode: result.periodCode,
          violationCount: result.violationCount,
          codes: [...new Set(result.violations.map((item) => item.code))],
        },
      });

      await this.webhooks.dispatch({
        eventType: WebhookEventType.INTEGRITY_VIOLATION,
        resourceRef: result.periodCode ?? result.checkedAt,
        data: {
          checkedAt: result.checkedAt,
          violationCount: result.violationCount,
          violations: result.violations.slice(0, 20),
        },
      });
    }

    return {
      checkedAt: result.checkedAt,
      periodCode: result.periodCode,
      checkedJournals: result.checkedJournals,
      checksRun: result.checksRun,
      violationCount: result.violationCount,
      passed: result.passed,
      highestSeverity: result.highestSeverity,
      violations: result.violations.slice(0, 20),
    };
  }

  // -------------------------------------------------------- chốt số dư

  private async runBalanceSnapshot(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as BalanceSnapshotPayload;
    const summary = await this.snapshots.run({
      periodId: payload.periodId ?? null,
      repair: payload.repair ?? false,
    });

    if (summary.driftCount > 0) {
      await this.notifications.create({
        type: NotificationType.INTEGRITY_ALERT,
        severity: summary.repairedCount > 0
          ? NotificationSeverity.WARNING
          : NotificationSeverity.CRITICAL,
        audience: NotificationAudience.ADMIN,
        title: summary.repairedCount > 0
          ? `Đã ghi lại số dư kỳ ${summary.periodCode} (${summary.repairedCount} tài khoản)`
          : `Số dư kỳ ${summary.periodCode} lệch so với bút toán`,
        body: [
          `Tài khoản lệch: ${summary.driftCount}.`,
          ...summary.drift
            .slice(0, 10)
            .map(
              (line) =>
                `• ${line.accountCode} ${line.accountName}: lưu ${line.storedDebit ?? '—'}/${line.storedCredit ?? '—'} · tái lập ${line.computedDebit}/${line.computedCredit}`,
            ),
        ].join('\n'),
        data: {
          periodId: summary.periodId,
          periodCode: summary.periodCode,
          driftCount: summary.driftCount,
          repairedCount: summary.repairedCount,
        },
      });
    }

    return {
      periodId: summary.periodId,
      periodCode: summary.periodCode,
      checkedAt: summary.checkedAt,
      checkedAccounts: summary.checkedAccounts,
      driftCount: summary.driftCount,
      repairedCount: summary.repairedCount,
      totalDebit: summary.totalDebit,
      totalCredit: summary.totalCredit,
      balanced: summary.balanced,
      drift: summary.drift.slice(0, 20),
    };
  }

  // ---------------------------------------------------- quét webhook treo

  private async runWebhookSweep(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as WebhookSweepPayload;
    const requeued = await this.webhooks.sweepPending(payload.limit ?? 100);
    return { requeued };
  }
}
