import { describe, expect, it, vi } from 'vitest';

import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import type { AgingReportService } from '../reports/aging-report.service.js';
import {
  type AgingBucketKey,
  type AgingLine,
  type AgingView,
} from '../reports/interfaces/aging-view.interface.js';
import { JobTrigger } from './enums/job.enum.js';
import { NotificationAudience, NotificationSeverity, NotificationType } from './enums/notification.enum.js';
import { WebhookEventType } from './enums/webhook.enum.js';
import type { NotificationsService } from './notifications.service.js';
import { OverdueInvoiceSweepService } from './overdue-invoice-sweep.service.js';
import type { WebhooksService } from './webhooks.service.js';

/**
 * Quét hóa đơn quá hạn là job **có tác dụng phụ ra ngoài** (thông báo + webhook), nên
 * test ở đây kiểm chứng đúng những gì dễ sai mà build xanh không bắt được:
 *
 * - chỉ hóa đơn **thật sự quá hạn** mới tính (bỏ "chưa đến hạn"/"không có hạn"),
 * - không có gì quá hạn ⇒ **không** tạo thông báo, **không** gọi ra ngoài,
 * - thông báo đi đúng người xử lý được (`poster`/`admin`), đúng mức độ,
 * - `resourceRef` của webhook gắn theo **ngày quét** nên chạy lại trong cùng ngày
 *   không gửi thêm (chống giao trùng nằm ở `WebhooksService`, ở đây chốt khóa đó).
 */
const AS_OF = '2026-03-31';

function line(overrides: Partial<AgingLine> & { targetId: string }): AgingLine {
  const daysOverdue = overrides.daysOverdue ?? null;
  return {
    targetType: AllocationTargetType.SALES_INVOICE,
    code: `INV-${overrides.targetId}`,
    partyId: 'party-1',
    partyCode: 'KH001',
    partyName: 'Khách A',
    date: '2026-01-01',
    dueDate: null,
    total: '0',
    allocated: '0',
    outstanding: '0',
    daysOverdue,
    bucket: bucketOf(daysOverdue),
    ...overrides,
  };
}

/** Ngưỡng nhóm tuổi — soi gương `bucketOf` của `AgingReportService`. */
function bucketOf(daysOverdue: number | null): AgingBucketKey {
  if (daysOverdue === null) return 'no_due_date';
  if (daysOverdue <= 0) return 'not_due';
  if (daysOverdue <= 30) return 'overdue_1_30';
  if (daysOverdue <= 60) return 'overdue_31_60';
  if (daysOverdue <= 90) return 'overdue_61_90';
  return 'overdue_over_90';
}

/** Dựng `AgingView` từ danh sách dòng (buckets tính lại từ chính các dòng). */
function view(lines: AgingLine[], asOfDate = AS_OF): AgingView {
  const labels: Record<AgingBucketKey, string> = {
    not_due: 'Chưa đến hạn',
    overdue_1_30: 'Quá hạn 1–30 ngày',
    overdue_31_60: 'Quá hạn 31–60 ngày',
    overdue_61_90: 'Quá hạn 61–90 ngày',
    overdue_over_90: 'Quá hạn trên 90 ngày',
    no_due_date: 'Không có ngày đến hạn',
  };
  const keys = Object.keys(labels) as AgingBucketKey[];
  const buckets = keys.map((key) => ({
    key,
    label: labels[key],
    amount: lines
      .filter((item) => item.bucket === key)
      .reduce((sum, item) => sum + Number(item.outstanding), 0)
      .toFixed(4),
  }));

  return {
    targetType: AllocationTargetType.SALES_INVOICE,
    asOfDate,
    buckets,
    totalOutstanding: buckets
      .reduce((sum, bucket) => sum + Number(bucket.amount), 0)
      .toFixed(4),
    lines,
    parties: [],
  };
}

function createService(
  receivables: AgingView,
): {
  service: OverdueInvoiceSweepService;
  notifications: { create: ReturnType<typeof vi.fn> };
  webhooks: { dispatch: ReturnType<typeof vi.fn> };
} {
  const notifications = {
    create: vi.fn(async (input: Record<string, unknown>) => ({
      id: 'notif-1',
      ...input,
    })),
  };
  const webhooks = {
    dispatch: vi.fn(async () => [{ id: 'delivery-1' }]),
  };
  const aging = {
    receivablesAging: vi.fn(async () => receivables),
    payablesAging: vi.fn(),
  };

  return {
    service: new OverdueInvoiceSweepService(
      aging as unknown as AgingReportService,
      notifications as unknown as NotificationsService,
      webhooks as unknown as WebhooksService,
    ),
    notifications,
    webhooks,
  };
}

describe('OverdueInvoiceSweepService', () => {
  it('không có hóa đơn quá hạn ⇒ không thông báo, không phát webhook', async () => {
    const { service, notifications, webhooks } = createService(
      view([
        line({ targetId: 'a', outstanding: '100', daysOverdue: 0 }),
        line({ targetId: 'b', outstanding: '200', daysOverdue: null }),
      ]),
    );

    const summary = await service.run({ asOfDate: AS_OF });

    expect(summary).toMatchObject({
      asOfDate: AS_OF,
      overdueInvoices: 0,
      overdueParties: 0,
      totalOverdue: '0.0000',
      oldestDaysOverdue: null,
      notificationCreated: false,
      notificationId: null,
      webhookDeliveries: 0,
    });
    expect(notifications.create).not.toHaveBeenCalled();
    expect(webhooks.dispatch).not.toHaveBeenCalled();
  });

  it('có hóa đơn quá hạn ⇒ tạo thông báo cho poster/admin và phát webhook theo ngày quét', async () => {
    const { service, notifications, webhooks } = createService(
      view([
        // Chưa đến hạn ⇒ không được tính vào nợ quá hạn.
        line({ targetId: 'a', outstanding: '500', daysOverdue: 0 }),
        line({
          targetId: 'b',
          outstanding: '100',
          daysOverdue: 16,
          partyId: 'party-1',
        }),
        line({
          targetId: 'c',
          outstanding: '250',
          daysOverdue: 45,
          partyId: 'party-2',
          partyCode: 'KH002',
          partyName: 'Khách B',
        }),
        line({
          targetId: 'd',
          outstanding: '50',
          daysOverdue: 120,
          partyId: 'party-2',
          partyCode: 'KH002',
          partyName: 'Khách B',
        }),
      ]),
    );

    const summary = await service.run({ asOfDate: AS_OF });

    expect(summary.overdueInvoices).toBe(3);
    expect(summary.overdueParties).toBe(2);
    expect(summary.totalOverdue).toBe('400.0000');
    expect(summary.oldestDaysOverdue).toBe(120);
    expect(summary.notificationCreated).toBe(true);
    expect(summary.notificationId).toBe('notif-1');
    expect(summary.webhookDeliveries).toBe(1);

    const created = notifications.create.mock.calls[0][0] as {
      type: string;
      severity: string;
      audience: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    };
    expect(created.type).toBe(NotificationType.OVERDUE_INVOICE);
    expect(created.severity).toBe(NotificationSeverity.WARNING);
    expect(created.audience).toBe(NotificationAudience.POSTER);
    expect(created.title).toContain(AS_OF);
    expect(created.body).toContain('3 hóa đơn');
    expect(created.body).toContain('400.0000');
    expect(created.body).toContain('120 ngày');
    // Gộp theo đối tượng: KH002 có 2 hóa đơn ⇒ 300.0000.
    expect(created.body).toContain('KH002 Khách B: 300.0000 (2 hóa đơn)');
    expect(created.data.oldestDaysOverdue).toBe(120);

    const dispatched = webhooks.dispatch.mock.calls[0][0] as {
      eventType: string;
      resourceRef: string;
      trigger: string;
      data: { invoices: unknown[]; totalOverdue: string };
    };
    expect(dispatched.eventType).toBe(WebhookEventType.INVOICE_OVERDUE);
    // Khóa chống giao trùng gắn theo **ngày quét**, không theo từng hóa đơn.
    expect(dispatched.resourceRef).toBe(`sweep:${AS_OF}`);
    expect(dispatched.trigger).toBe(JobTrigger.SCHEDULE);
    expect(dispatched.data.totalOverdue).toBe('400.0000');
    expect(dispatched.data.invoices).toHaveLength(3);
  });

  it('rất nhiều hóa đơn quá hạn ⇒ thân thông báo cắt gọn nhưng tổng vẫn đủ', async () => {
    const many = Array.from({ length: 13 }, (_, index) =>
      line({
        targetId: `p${index}`,
        outstanding: '10',
        daysOverdue: 5,
        partyId: `party-${index}`,
        partyCode: `KH${index}`,
        partyName: `Khách ${index}`,
      }),
    );
    const { service, notifications, webhooks } = createService(view(many));

    const summary = await service.run({ asOfDate: AS_OF });

    expect(summary.overdueInvoices).toBe(13);
    expect(summary.totalOverdue).toBe('130.0000');

    const created = notifications.create.mock.calls[0][0] as { body: string };
    expect(created.body).toContain('… và 3 đối tượng khác.');

    const dispatched = webhooks.dispatch.mock.calls[0][0] as {
      data: { invoices: unknown[] };
    };
    // Danh sách chi tiết trong payload cũng bị chặn trần, nhưng tổng vẫn là con số thật.
    expect(dispatched.data.invoices).toHaveLength(10);
  });

  it('chạy lại trong cùng ngày ⇒ cùng resourceRef (WebhooksService chống giao trùng)', async () => {
    const { service, webhooks } = createService(
      view([line({ targetId: 'a', outstanding: '10', daysOverdue: 3 })]),
    );

    await service.run({ asOfDate: AS_OF });
    await service.run({ asOfDate: AS_OF });

    const first = webhooks.dispatch.mock.calls[0][0] as { resourceRef: string };
    const second = webhooks.dispatch.mock.calls[1][0] as { resourceRef: string };
    expect(second.resourceRef).toBe(first.resourceRef);
  });
});
