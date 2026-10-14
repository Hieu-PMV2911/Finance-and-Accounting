import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import {
  REPORT_KIND_LABELS,
  type ReportFormat,
  ReportKind,
} from '../../reports/enums/report.enum.js';
import { ReportExportService } from '../../reports/report-export.service.js';
import { ReportsService } from '../../reports/reports.service.js';
import { JobName, JobQueue, JobTrigger } from '../enums/job.enum.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationType,
} from '../enums/notification.enum.js';
import type { GenerateReportPayload } from '../interfaces/job-payload.interface.js';
import { JobRunsService } from '../job-runs.service.js';
import { QueueService } from '../queue.service.js';
import { ReportStorageService } from '../report-storage.service.js';
import { TrackedWorkerHost } from './tracked-worker-host.js';

/** Phạm vi báo cáo sau khi chuẩn hóa — hoặc theo kỳ, hoặc theo khoảng ngày. */
interface NormalizedScope {
  periodId?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Sinh báo cáo tài chính ở chế độ nền (mục 9 — "job nền: sinh báo cáo nặng").
 *
 * Vì sao phải chạy nền: ba báo cáo tài chính quét toàn bộ `journal_lines` rồi
 * dựng file Excel/PDF — với dữ liệu lớn có thể mất vài giây tới vài chục giây.
 * Chạy trong request sẽ chặn kết nối HTTP và dễ timeout ở tầng proxy.
 *
 * Job nhận **phạm vi** (kỳ hoặc khoảng ngày) và **định dạng**. Nếu có định dạng,
 * file được lưu xuống đĩa để tải về sau; sau đó một job `send-notification` được
 * xếp tiếp để báo cho người yêu cầu — minh họa đúng chuỗi "job nền → gửi thông
 * báo" mà không cần dịch vụ email bên ngoài.
 */
@Processor(JobQueue.REPORTS)
export class ReportsProcessor extends TrackedWorkerHost {
  constructor(
    runs: JobRunsService,
    private readonly reports: ReportsService,
    private readonly exporter: ReportExportService,
    private readonly storage: ReportStorageService,
    private readonly queue: QueueService,
  ) {
    super(runs);
  }

  protected async handle(
    job: Job,
    runId: string | null,
  ): Promise<Record<string, unknown>> {
    if (!runId) {
      throw new Error('Job báo cáo thiếu jobRunId — không xác định được lượt chạy');
    }

    const payload = job.data as GenerateReportPayload;
    const kind = payload.kind ?? ReportKind.PROFIT_AND_LOSS;
    const format: ReportFormat | undefined = payload.format;
    const scope = normalizeScope(payload);
    const scopeText = payload.periodId
      ? 'theo kỳ đã chọn'
      : `${scope.fromDate} → ${scope.toDate}`;

    const result: Record<string, unknown> = {
      kind,
      format: format ?? null,
      scopeText,
      periodId: scope.periodId ?? null,
    };

    if (format) {
      const file = await this.exporter.export(kind, { ...scope, format });
      result.filename = file.filename;
      result.storedAs = await this.storage.save(runId, file.filename, file.buffer);
      result.bytes = file.buffer.length;
    } else {
      result.summary = await this.summarize(kind, scope);
    }

    await this.notify(payload, kind, format, scopeText, result, runId);
    return result;
  }

  /** Xếp job gửi thông báo "báo cáo sẵn sàng" cho người yêu cầu. */
  private async notify(
    payload: GenerateReportPayload,
    kind: ReportKind,
    format: ReportFormat | undefined,
    scopeText: string,
    result: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const filename = typeof result.filename === 'string' ? result.filename : null;

    await this.queue.enqueue({
      queue: JobQueue.NOTIFICATIONS,
      jobName: JobName.SEND_NOTIFICATION,
      trigger: JobTrigger.SYSTEM,
      payload: {
        type: NotificationType.REPORT_READY,
        severity: NotificationSeverity.INFO,
        audience: payload.requestedBy
          ? NotificationAudience.TARGETED
          : NotificationAudience.ADMIN,
        targetUserId: payload.requestedBy ?? null,
        title: `Báo cáo ${REPORT_KIND_LABELS[kind]} đã sẵn sàng`,
        body: filename
          ? `File ${filename} (${scopeText}) đã sinh xong và sẵn sàng tải xuống.`
          : `Số liệu ${REPORT_KIND_LABELS[kind]} (${scopeText}) đã tính xong.`,
        data: { jobRunId: runId, kind, format: format ?? null, filename },
      },
    });
  }

  /** Tóm tắt gọn cho chế độ chỉ tính số liệu (tránh payload khổng lồ trong DB). */
  private async summarize(
    kind: ReportKind,
    scope: NormalizedScope,
  ): Promise<Record<string, unknown>> {
    switch (kind) {
      case ReportKind.BALANCE_SHEET: {
        const view = await this.reports.balanceSheet(scope);
        return {
          asOfDate: view.asOfDate,
          totalAssets: view.totalAssets,
          totalLiabilitiesAndEquity: view.totalLiabilitiesAndEquity,
          balanced: view.balanced,
        };
      }
      case ReportKind.CASH_FLOW: {
        const view = await this.reports.cashFlow(scope);
        return {
          openingCash: view.openingCash,
          netChange: view.netChange,
          closingCash: view.closingCash,
        };
      }
      default: {
        const view = await this.reports.profitAndLoss(scope);
        return {
          revenueTotal: view.revenue.total,
          expenseTotal: view.expense.total,
          netProfit: view.netProfit,
          netProfitMargin: view.netProfitMargin,
        };
      }
    }
  }
}

/**
 * Chuẩn hóa phạm vi: theo kỳ nếu có, ngược lại theo khoảng ngày; thiếu cả hai thì
 * lấy **từ đầu năm đến hôm nay** — job nền không nên chết chỉ vì client quên
 * truyền phạm vi.
 */
function normalizeScope(payload: GenerateReportPayload): NormalizedScope {
  if (payload.periodId) {
    return { periodId: payload.periodId };
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    fromDate: payload.fromDate ?? `${today.slice(0, 4)}-01-01`,
    toDate: payload.toDate ?? today,
  };
}
