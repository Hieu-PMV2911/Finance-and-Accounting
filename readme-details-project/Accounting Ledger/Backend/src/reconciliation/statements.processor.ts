import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { JobName, JobQueue } from '../jobs/enums/job.enum.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../jobs/enums/notification.enum.js';
import type {
  ImportStatementPayload,
  ReconciliationCatchupPayload,
} from '../jobs/interfaces/job-payload.interface.js';
import { JobRunsService } from '../jobs/job-runs.service.js';
import { NotificationsService } from '../jobs/notifications.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { TrackedWorkerHost } from '../jobs/processors/tracked-worker-host.js';
import { BankStatementsService } from './bank-statements.service.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * Worker của hàng đợi **`statements`** (mục 10.B).
 *
 * Hai job:
 * - `import-statement`: chuẩn hóa file sao kê → chống trùng → khớp đối soát.
 *   Chạy nền vì file sao kê có thể dài; request tạo sao kê chỉ trả `202`.
 * - `reconciliation-catchup`: khớp lại mọi sao kê còn mở (dữ liệu chứng từ có thể
 *   về sau khi sao kê đã nhập) và **báo cáo lệch tồn đọng** cho người ghi sổ.
 *
 * Việc báo cáo lệch tồn đọng là có chủ đích: một danh sách lệch không ai nhìn thì
 * bằng không có đối soát.
 */
@Processor(JobQueue.STATEMENTS)
export class StatementsProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly statements: BankStatementsService,
    private readonly reconciliation: ReconciliationService,
    private readonly exceptions: ReconciliationExceptionsService,
    private readonly notifications: NotificationsService,
    queue: QueueService,
  ) {
    super(runs, queue);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    switch (job.name) {
      case JobName.IMPORT_STATEMENT:
        return this.importStatement(job);
      case JobName.RECONCILIATION_CATCHUP:
        return this.catchUp(job);
      default:
        throw new Error(`Job "${job.name}" không được hỗ trợ ở hàng đợi sao kê`);
    }
  }

  private async importStatement(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as ImportStatementPayload;
    const result = await this.statements.importStatement(payload.statementId);

    return {
      statementId: result.statementId,
      adapter: result.adapter,
      parsed: result.parsed,
      inserted: result.inserted,
      skippedDuplicates: result.skippedDuplicates,
      match: result.match,
    };
  }

  private async catchUp(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as ReconciliationCatchupPayload;
    const result = await this.reconciliation.catchUp();
    const counts = await this.exceptions.countByStatus();

    if (counts.open > 0) {
      await this.notifications.create({
        type: NotificationType.SYSTEM,
        severity: NotificationSeverity.WARNING,
        audience: NotificationAudience.POSTER,
        title: `Đối soát: còn ${counts.open} giao dịch lệch chưa xử lý`,
        body: [
          `Đã khớp lại ${result.statements} bảng sao kê còn mở.`,
          `Lệch chưa xử lý: ${counts.open}.`,
          payload.asOfDate ? `Mốc thời gian: ${payload.asOfDate}.` : '',
          'Xem chi tiết tại màn hình Đối soát.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        data: { statements: result.statements, openExceptions: counts.open },
      });
    }

    return {
      statements: result.statements,
      summaries: result.summary,
      openExceptions: counts.open,
    };
  }
}
