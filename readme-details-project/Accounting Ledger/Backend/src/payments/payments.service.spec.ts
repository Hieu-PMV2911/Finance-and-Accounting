import { BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import { PaymentDirection } from '../common/enums/payment-direction.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../common/enums/payment-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { JobTrigger } from '../jobs/enums/job.enum.js';
import { WebhookEventType } from '../jobs/enums/webhook.enum.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentsService } from './payments.service.js';

/**
 * Phiếu thu/chi (P1.3) — phần dễ sai nhất là **chiều hạch toán** và **thời điểm** được
 * ghi sổ (chỉ từ `approved`, gọi lại khi đã `posted` thì không sinh bút toán thứ hai).
 *
 * Bút toán ở đây là `source_type = payment` bắt buộc: nếu thiếu, hóa đơn/phiếu mất khả
 * năng truy vết và unique `(source_type, source_id)` không chặn được ghi trùng.
 */
const UUID = '22222222-2222-4222-8222-222222222222';

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: UUID,
    code: 'PT-2026-0001',
    direction: PaymentDirection.RECEIPT,
    partyId: 'party-1',
    date: '2026-03-10',
    amount: '300000.0000',
    currency: 'VND',
    method: PaymentMethod.CASH,
    reference: null,
    description: null,
    cashAccountId: 'acc-111',
    idempotencyKey: null,
    status: PaymentStatus.DRAFT,
    journalEntryId: null,
    reversalJournalEntryId: null,
    createdBy: 'user-maker',
    approvedBy: null,
    approvedAt: null,
    postedBy: null,
    postedAt: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    party: undefined,
    createdAt: new Date('2026-03-10T00:00:00Z'),
    updatedAt: new Date('2026-03-10T00:00:00Z'),
    ...overrides,
  } as Payment;
}

function createService(current: Payment): {
  service: PaymentsService;
  journals: {
    postDocument: ReturnType<typeof vi.fn>;
    reverseDocument: ReturnType<typeof vi.fn>;
  };
  webhooks: { dispatch: ReturnType<typeof vi.fn> };
  allocations: { allocatedFromSource: ReturnType<typeof vi.fn> };
  accounts: { requirePostableByCodePrefix: ReturnType<typeof vi.fn> };
  manager: { update: ReturnType<typeof vi.fn> };
} {
  const manager = { update: vi.fn(async () => ({ affected: 1 })) };
  const journals = {
    postDocument: vi.fn(
      async (
        dto: unknown,
        _actorId: string,
        commit: (m: unknown, entry: unknown) => Promise<void>,
      ) => {
        const entry = { id: 'entry-1' };
        await commit(manager, entry);
        return entry;
      },
    ),
    reverseDocument: vi.fn(
      async (
        _id: string,
        dto: unknown,
        _actorId: string,
        commit: (m: unknown, reversal: unknown) => Promise<void>,
      ) => {
        const reversal = { id: 'entry-reversal' };
        await commit(manager, reversal);
        return reversal;
      },
    ),
  };
  const webhooks = { dispatch: vi.fn(async () => []) };
  const allocations = {
    allocatedFromSource: vi.fn(async () => new Decimal(0)),
  };
  const accounts = {
    getPostable: vi.fn(async () => ({ id: 'acc-111', code: '111' })),
    requirePostableByCodePrefix: vi.fn(async (prefix: string) => ({
      id: `acc-${prefix}`,
      code: prefix,
    })),
  };
  const periods = {
    resolveByDate: vi.fn(async () => ({ id: 'period-1' })),
    assertAcceptsPostings: vi.fn(),
  };

  const service = new PaymentsService(
    {
      findOne: vi.fn(async () => current),
      save: vi.fn(async (entity: Payment) => entity),
      create: vi.fn((entity: Partial<Payment>) => entity),
    } as never,
    { resolveActive: vi.fn() } as never,
    accounts as never,
    periods as never,
    journals as never,
    allocations as never,
    webhooks as never,
  );

  return {
    service,
    journals,
    webhooks,
    allocations,
    accounts,
    manager,
  };
}

describe('PaymentsService — ghi sổ phiếu thu/chi', () => {
  it('phiếu thu: Nợ 111 / Có 131 (kèm đối tượng) và phát webhook payment.posted', async () => {
    const { service, journals, webhooks, manager } = createService(
      payment({ status: PaymentStatus.APPROVED }),
    );

    const result = await service.post(UUID, 'user-poster');

    expect(result.status).toBe(PaymentStatus.POSTED);
    expect(result.journalEntryId).toBe('entry-1');

    // Cập nhật phiếu nằm TRONG transaction ghi sổ (P1.2).
    expect(journals.postDocument).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(Payment, UUID, {
      status: PaymentStatus.POSTED,
      journalEntryId: 'entry-1',
      postedBy: 'user-poster',
      postedAt: expect.any(Date) as Date,
      cashAccountId: 'acc-111',
    });

    const dto = journals.postDocument.mock.calls[0][0] as {
      sourceType: string;
      sourceId: string;
      reference: string;
      lines: { accountId: string; debit?: string; credit?: string; partyId?: string }[];
    };
    expect(dto.sourceType).toBe(SourceType.PAYMENT);
    expect(dto.sourceId).toBe(UUID);
    expect(dto.reference).toBe('PT-2026-0001');
    expect(dto.lines[0]).toMatchObject({ accountId: 'acc-111', debit: '300000.0000' });
    expect(dto.lines[1]).toMatchObject({
      accountId: 'acc-131',
      credit: '300000.0000',
      partyId: 'party-1',
    });

    const dispatched = webhooks.dispatch.mock.calls[0][0] as {
      eventType: string;
      resourceRef: string;
      trigger: string;
      data: Record<string, unknown>;
    };
    expect(dispatched.eventType).toBe(WebhookEventType.PAYMENT_POSTED);
    expect(dispatched.resourceRef).toBe(UUID);
    expect(dispatched.trigger).toBe(JobTrigger.SYSTEM);
    expect(dispatched.data).toMatchObject({
      code: 'PT-2026-0001',
      direction: PaymentDirection.RECEIPT,
      amount: '300000.0000',
      journalEntryId: 'entry-1',
    });
  });

  it('phiếu chi: Nợ 331 (kèm đối tượng) / Có 111', async () => {
    const { service, journals } = createService(
      payment({
        status: PaymentStatus.APPROVED,
        direction: PaymentDirection.PAYMENT,
      }),
    );

    await service.post(UUID, 'user-poster');

    const dto = journals.postDocument.mock.calls[0][0] as {
      lines: { accountId: string; debit?: string; credit?: string; partyId?: string }[];
    };
    expect(dto.lines[0]).toMatchObject({
      accountId: 'acc-331',
      debit: '300000.0000',
      partyId: 'party-1',
    });
    expect(dto.lines[1]).toMatchObject({ accountId: 'acc-111', credit: '300000.0000' });
  });

  it('chỉ ghi sổ được phiếu đã xác nhận', async () => {
    const { service, journals, webhooks } = createService(
      payment({ status: PaymentStatus.DRAFT }),
    );

    await expect(service.post(UUID, 'user-poster')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(journals.postDocument).not.toHaveBeenCalled();
    expect(webhooks.dispatch).not.toHaveBeenCalled();
  });

  it('gọi lại khi đã ghi sổ ⇒ idempotent: không sinh bút toán thứ hai, không phát lại webhook', async () => {
    const { service, journals, webhooks } = createService(
      payment({ status: PaymentStatus.POSTED, journalEntryId: 'entry-1' }),
    );

    const result = await service.post(UUID, 'user-poster');

    expect(result.status).toBe(PaymentStatus.POSTED);
    expect(journals.postDocument).not.toHaveBeenCalled();
    expect(webhooks.dispatch).not.toHaveBeenCalled();
  });

  it('hủy phiếu đã ghi sổ ⇒ sinh bút toán đảo, không sửa bút toán gốc', async () => {
    const { service, journals, manager } = createService(
      payment({ status: PaymentStatus.POSTED, journalEntryId: 'entry-1' }),
    );

    const result = await service.voidPayment(
      UUID,
      { reason: 'Khách báo nhầm', date: '2026-03-12' },
      'user-poster',
    );

    expect(journals.reverseDocument).toHaveBeenCalledWith(
      'entry-1',
      { reason: 'Khách báo nhầm', date: '2026-03-12' },
      'user-poster',
      expect.any(Function) as unknown as never,
    );
    // Chuyển `voided` nằm cùng transaction với bút toán đảo.
    expect(manager.update).toHaveBeenCalledWith(Payment, UUID, {
      status: PaymentStatus.VOIDED,
      voidedBy: 'user-poster',
      voidedAt: expect.any(Date) as Date,
      voidReason: 'Khách báo nhầm',
      reversalJournalEntryId: 'entry-reversal',
    });
    expect(result.status).toBe(PaymentStatus.VOIDED);
    expect(result.reversalJournalEntryId).toBe('entry-reversal');
  });
});
