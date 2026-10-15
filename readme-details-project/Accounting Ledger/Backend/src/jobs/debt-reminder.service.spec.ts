import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import type { AgingReportService } from '../reports/aging-report.service.js';
import type {
  AgingBucketKey,
  AgingLine,
  AgingView,
} from '../reports/interfaces/aging-view.interface.js';
import {
  DebtReminderService,
  type DebtReminderSummary,
} from './debt-reminder.service.js';
import { NotificationAudience, NotificationType } from './enums/notification.enum.js';
import type { NotificationsService } from './notifications.service.js';

/**
 * Nhắc công nợ (mục 9, nâng cấp ở 10.A) đọc **hai nguồn khác nhau** và ghép lại:
 * sổ cái (theo tài khoản 131/331) và chứng từ (theo đối tượng + tuổi nợ). Test này
 * chốt đúng những chỗ dễ sai của phép ghép đó:
 *
 * - số dư Có của 331 được đổi dấu thành "còn phải trả" dương,
 * - tài khoản đã tất toán (net = 0) bị bỏ,
 * - chỉ nhóm **quá hạn** mới vào `totalOverdue` (không tính "chưa đến hạn"),
 * - gộp theo đối tượng và xếp theo số còn nợ giảm dần,
 * - không có gì để nhắc ⇒ **không** tạo thông báo.
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

function bucketOf(daysOverdue: number | null): AgingBucketKey {
  if (daysOverdue === null) return 'no_due_date';
  if (daysOverdue <= 0) return 'not_due';
  if (daysOverdue <= 30) return 'overdue_1_30';
  if (daysOverdue <= 60) return 'overdue_31_60';
  if (daysOverdue <= 90) return 'overdue_61_90';
  return 'overdue_over_90';
}

const BUCKET_LABELS: Record<AgingBucketKey, string> = {
  not_due: 'Chưa đến hạn',
  overdue_1_30: 'Quá hạn 1–30 ngày',
  overdue_31_60: 'Quá hạn 31–60 ngày',
  overdue_61_90: 'Quá hạn 61–90 ngày',
  overdue_over_90: 'Quá hạn trên 90 ngày',
  no_due_date: 'Không có ngày đến hạn',
};

function view(lines: AgingLine[], asOfDate = AS_OF): AgingView {
  const buckets = (Object.keys(BUCKET_LABELS) as AgingBucketKey[]).map((key) => ({
    key,
    label: BUCKET_LABELS[key],
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

interface BalanceRow {
  code: string;
  name: string;
  net: string;
}

function createService(input: {
  balances: BalanceRow[];
  receivables?: AgingView;
  payables?: AgingView;
}): {
  service: DebtReminderService;
  notifications: { create: ReturnType<typeof vi.fn> };
} {
  const dataSource = {
    query: vi.fn(async () => input.balances),
  } as unknown as DataSource;

  const aging = {
    receivablesAging: vi.fn(async () => input.receivables ?? view([])),
    payablesAging: vi.fn(async () => input.payables ?? view([])),
  } as unknown as AgingReportService;

  const notifications = {
    create: vi.fn(async (payload: Record<string, unknown>) => ({
      id: 'notif-1',
      ...payload,
    })),
  };

  return {
    service: new DebtReminderService(
      dataSource,
      aging,
      notifications as unknown as NotificationsService,
    ),
    notifications,
  };
}

describe('DebtReminderService', () => {
  it('ghép số dư sổ cái (đổi dấu 331) với tuổi nợ theo đối tượng', async () => {
    const { service, notifications } = createService({
      balances: [
        { code: '131', name: 'Phải thu khách hàng', net: '400.0000' },
        { code: '1312', name: 'Phải thu khác', net: '0.0000' },
        { code: '331', name: 'Phải trả người bán', net: '-250.0000' },
      ],
      receivables: view([
        line({ targetId: 'a', outstanding: '100', daysOverdue: 10 }),
        line({ targetId: 'b', outstanding: '50', daysOverdue: 40 }),
        line({ targetId: 'c', outstanding: '250', daysOverdue: -5 }),
        line({
          targetId: 'd',
          outstanding: '300',
          daysOverdue: 200,
          partyId: 'party-2',
          partyCode: 'KH002',
          partyName: 'Khách B',
        }),
      ]),
      payables: view([
        line({ targetId: 'e', outstanding: '250', daysOverdue: null }),
      ]),
    });

    const summary: DebtReminderSummary = await service.run({
      asOfDate: AS_OF,
    });

    // Sổ cái: 131 dư Nợ ⇒ còn phải thu; 331 dư Có ⇒ đổi dấu thành phải trả.
    expect(summary.receivableAccounts).toEqual([
      {
        accountCode: '131',
        accountName: 'Phải thu khách hàng',
        outstanding: '400.0000',
      },
    ]);
    expect(summary.payableAccounts).toEqual([
      {
        accountCode: '331',
        accountName: 'Phải trả người bán',
        outstanding: '250.0000',
      },
    ]);
    expect(summary.totalReceivable).toBe('400.0000');
    expect(summary.totalPayable).toBe('250.0000');

    // Tuổi nợ: "chưa đến hạn" (âm) không phải nợ quá hạn.
    const aging = summary.receivablesAging;
    expect(aging.totalOutstanding).toBe('700.0000');
    expect(aging.totalOverdue).toBe('450.0000');
    expect(aging.documents).toBe(4);
    // Xếp theo số còn nợ giảm dần: KH001 (400) trước KH002 (300).
    expect(aging.parties.map((party) => party.partyCode)).toEqual([
      'KH001',
      'KH002',
    ]);
    expect(aging.parties[0]).toMatchObject({
      partyCode: 'KH001',
      outstanding: '400.0000',
      overdue: '150.0000',
      oldestDaysOverdue: 40,
      documents: 3,
    });
    expect(aging.parties[1]).toMatchObject({
      partyCode: 'KH002',
      outstanding: '300.0000',
      overdue: '300.0000',
      oldestDaysOverdue: 200,
      documents: 1,
    });
    // Phải trả: không có hạn thanh toán ⇒ không nằm trong phần quá hạn.
    expect(summary.payablesAging.totalOverdue).toBe('0.0000');

    const created = notifications.create.mock.calls[0][0] as {
      type: string;
      audience: string;
      body: string;
      data: Record<string, unknown>;
    };
    expect(created.type).toBe(NotificationType.DEBT_REMINDER);
    expect(created.audience).toBe(NotificationAudience.ALL);
    expect(created.body).toContain('Phải thu theo tài khoản');
    expect(created.body).toContain('Tuổi nợ phải thu — còn lại 700.0000');
    expect(created.body).toContain('quá hạn 450.0000');
    expect(created.body).toContain(
      '• KH001 Khách A: 400.0000 (quá hạn 150.0000, lâu nhất 40 ngày, 3 chứng từ)',
    );
    expect(created.body).toContain(
      '• KH002 Khách B: 300.0000 (quá hạn 300.0000, lâu nhất 200 ngày, 1 chứng từ)',
    );
    expect(created.data.receivableOverdue).toBe('450.0000');
    expect(created.data.receivableParties).toBe(2);
  });

  it('mọi công nợ đã tất toán ⇒ không tạo thông báo', async () => {
    const { service, notifications } = createService({
      balances: [
        { code: '131', name: 'Phải thu khách hàng', net: '0.0000' },
        { code: '331', name: 'Phải trả người bán', net: '0.0000' },
      ],
    });

    const summary = await service.run({ asOfDate: AS_OF });

    expect(summary.receivableAccounts).toEqual([]);
    expect(summary.payableAccounts).toEqual([]);
    expect(summary.totalReceivable).toBe('0.0000');
    expect(summary.totalPayable).toBe('0.0000');
    expect(summary.receivablesAging.documents).toBe(0);
    expect(summary.notificationCreated).toBe(false);
    expect(summary.notificationId).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('dùng ngày hôm nay khi không truyền asOfDate', async () => {
    const { service } = createService({ balances: [] });

    const summary = await service.run();

    expect(summary.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
