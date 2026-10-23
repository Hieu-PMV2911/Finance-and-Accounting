import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { JobName, JobQueue } from '../enums/job.enum.js';
import type {
  ImportStatementPayload,
  ReconcileStatementPayload,
  ReconciliationCatchupPayload,
} from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { QueueService } from '../queue.service.js';
import { ReconciliationRegistry } from '../reconciliation-registry.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/**
 * Nạp & đối soát sao kê ngân hàng (mục 10.B — P2.2/P2.3).
 *
 * Hai việc:
 * - `import-statement`: đọc/normlalize nội dung CSV/JSON → dòng `bank_transactions`,
 *   chống trùng theo khóa nghiệp vụ. Chạy nền để request nạp file lớn không bị
 *   chặn (controller trả `202` ngay).
 * - `reconcile-statement`: chạy pipeline 3 tầng trên một sao kê đã nạp.
 * - `reconciliation-catchup`: quét mọi sao kê còn `imported` để đối soát bù
 *   (cron hằng ngày) — bắt kịp khi dòng mới nạp hoặc phiếu mới ghi sổ.
 *
 * Gọi nghiệp vụ qua `ReconciliationRegistry` để `JobsModule` không phải import
 * `ReconciliationModule` (tránh vòng phụ thuộc, cùng lý do với payments).
 */
@Processor(JobQueue.STATEMENTS)
export class StatementsProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    queues: QueueService,
    private readonly registry: ReconciliationRegistry,
  ) {
    super(runs, queues);
  }

  protected async handle(job: Job): Promise<Record<string, unknown>> {
    switch (job.name) {
      case JobName.IMPORT_STATEMENT:
        return this.importStatement(job);
      case JobName.RECONCILE_STATEMENT:
        return this.reconcileStatement(job);
      case JobName.RECONCILIATION_CATCHUP:
        return this.catchup(job);
      default:
        throw new Error(
          `Job "${job.name}" không được hỗ trợ ở hàng đợi sao kê`,
        );
    }
  }

  private async importStatement(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as ImportStatementPayload;
    const result = (await this.registry.importStatement({
      accountId: payload.accountId,
      source: payload.source,
      sourceRef: payload.sourceRef,
      statementDate: payload.statementDate,
      openingBalance: payload.openingBalance,
      closingBalance: payload.closingBalance,
      content: payload.content,
    })) as {
      statementId: string;
      code: string;
      imported: number;
      skipped: number;
    };

    return { ...result };
  }

  private async reconcileStatement(
    job: Job,
  ): Promise<Record<string, unknown>> {
    const payload = job.data as ReconcileStatementPayload;
    const result = await this.registry.reconcileStatement(payload.statementId);
    return { ...result };
  }

  private async catchup(job: Job): Promise<Record<string, unknown>> {
    const payload = job.data as ReconciliationCatchupPayload;
    const result = await this.registry.catchup(payload.limit ?? 50);
    return { ...result };
  }
}
