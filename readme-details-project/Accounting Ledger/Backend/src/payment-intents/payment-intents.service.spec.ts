import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentDirection } from '../common/enums/payment-direction.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { PaymentIntent } from './entities/payment-intent.entity.js';
import { PaymentIntentStatus } from './enums/payment-intent-status.enum.js';
import { ReconciliationExceptionType } from './enums/reconciliation-exception.enum.js';
import type { ProviderResult } from './interfaces/payment-provider.interface.js';
import {
  PaymentIntentsService,
  SYSTEM_ACTOR_ID,
} from './payment-intents.service.js';

const INTENT_ID = '11111111-1111-4111-8111-111111111111';
const PARTY_ID = '22222222-2222-4222-8222-222222222222';

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: INTENT_ID,
    code: 'PI-20261019-ABC123',
    idempotencyKey: 'pi_key_1',
    direction: PaymentDirection.RECEIPT,
    partyId: PARTY_ID,
    invoiceId: null,
    date: '2026-10-19',
    amount: '1500000.0000',
    currency: 'VND',
    method: PaymentMethod.BANK_TRANSFER,
    cashAccountId: 'acc-112',
    reference: null,
    description: null,
    status: PaymentIntentStatus.UNKNOWN,
    provider: 'simulator',
    providerRef: 'sim_key_1',
    providerStatus: 'timeout',
    attempts: 1,
    lastCheckedAt: new Date('2026-10-19T01:00:00Z'),
    escalationNotifiedAt: null,
    journalEntryId: null,
    capturedAt: null,
    settledAt: null,
    createdBy: 'user-maker',
    party: undefined,
    createdAt: new Date('2026-10-19T00:00:00Z'),
    updatedAt: new Date('2026-10-19T00:00:00Z'),
    ...overrides,
  } as PaymentIntent;
}

const CAPTURED_RESULT: ProviderResult = {
  outcome: 'captured',
  providerRef: 'sim_key_1',
  providerStatus: 'captured',
  message: null,
  raw: null,
};

function build(seed: PaymentIntent) {
  const store = new Map<string, PaymentIntent>([[seed.id, seed]]);

  const intents = {
    findOne: vi.fn(async (options: { where: Record<string, unknown> }) => {
      const where = options.where;
      if (typeof where.id === 'string') return store.get(where.id) ?? null;
      if (typeof where.idempotencyKey === 'string') {
        return (
          [...store.values()].find(
            (row) => row.idempotencyKey === where.idempotencyKey,
          ) ?? null
        );
      }
      return null;
    }),
    find: vi.fn(async () => [...store.values()]),
    save: vi.fn(async (entity: PaymentIntent) => {
      store.set(entity.id, { ...entity });
      return entity;
    }),
    create: vi.fn((entity: Partial<PaymentIntent>) => ({
      ...entity,
      id: INTENT_ID,
    })),
    exists: vi.fn(async () => false),
  };

  const managerUpdate = vi.fn(async () => ({ affected: 1 }));
  const journals = {
    postDocument: vi.fn(
      async (
        _dto: unknown,
        _actorId: string,
        commit: (m: unknown, entry: unknown) => Promise<void>,
      ) => {
        const entry = { id: 'entry-1' };
        await commit({ update: managerUpdate }, entry);
        return entry;
      },
    ),
  };
  const accounts = {
    getPostable: vi.fn(async () => ({ id: 'acc-112' })),
    requirePostableByCodePrefix: vi.fn(async (prefix: string) => ({
      id: `acc-${prefix}`,
    })),
  };
  const periods = {
    resolveByDate: vi.fn(async () => ({ id: 'period-1' })),
    assertAcceptsPostings: vi.fn(),
  };
  const notifications = { create: vi.fn(async () => ({ id: 'notif-1' })) };
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  const webhooks = {
    registerInboundHandler: vi.fn((type: string, handler) => {
      handlers.set(type, handler);
    }),
  };
  const exceptions = {
    create: vi.fn(async (input: Record<string, unknown>) => ({
      id: 'exception-1',
      ...input,
    })),
  };
  const polls = { register: vi.fn() };
  const provider = {
    name: 'simulator',
    charge: vi.fn(async () => CAPTURED_RESULT),
    fetch: vi.fn(async () => CAPTURED_RESULT),
  };

  const service = new PaymentIntentsService(
    intents as never,
    { resolveActive: vi.fn() } as never,
    accounts as never,
    periods as never,
    journals as never,
    notifications as never,
    webhooks as never,
    polls as never,
    exceptions as never,
    provider as never,
  );

  return {
    service,
    store,
    intents,
    journals,
    accounts,
    periods,
    notifications,
    webhooks,
    handlers,
    exceptions,
    polls,
    provider,
    managerUpdate,
  };
}

describe('PaymentIntentsService', () => {
  beforeEach(() => {
    delete process.env.PAYMENT_INTENT_MAX_POLLS;
  });

  describe('create', () => {
    it('timeout của provider ⇒ "chưa xác định", KHÔNG coi là thất bại và KHÔNG ghi sổ', async () => {
      const seed = intent({
        status: PaymentIntentStatus.INITIATED,
        idempotencyKey: 'old_key',
      });
      const ctx = build(seed);
      ctx.provider.charge.mockResolvedValue({
        outcome: 'unknown',
        providerRef: 'sim_key_1',
        providerStatus: 'timeout',
        message: 'timeout',
        raw: null,
      });

      const created = await ctx.service.create(
        {
          idempotencyKey: 'pi_key_1',
          partyId: PARTY_ID,
          amount: '1500000.0000',
          method: PaymentMethod.BANK_TRANSFER,
          date: '2026-10-19',
        },
        'user-maker',
      );

      expect(created.status).toBe(PaymentIntentStatus.UNKNOWN);
      expect(created.providerStatus).toBe('timeout');
      expect(ctx.journals.postDocument).not.toHaveBeenCalled();
      expect(ctx.provider.charge).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'pi_key_1' }),
      );
    });

    it('cùng idempotencyKey ⇒ trả intent cũ, không gọi provider lần hai', async () => {
      const ctx = build(intent());
      const first = await ctx.service.create(
        {
          idempotencyKey: 'pi_key_1',
          partyId: PARTY_ID,
          amount: '1500000.0000',
          method: PaymentMethod.BANK_TRANSFER,
        },
        'user-maker',
      );

      expect(first.id).toBe(INTENT_ID);
      expect(ctx.provider.charge).not.toHaveBeenCalled();
      expect(ctx.intents.save).not.toHaveBeenCalled();
    });

    it('kỳ đã khóa ⇒ chặn TRƯỚC khi gọi provider (không thu tiền rồi mới phát hiện)', async () => {
      const ctx = build(
        intent({ status: PaymentIntentStatus.INITIATED, idempotencyKey: 'old_key' }),
      );
      ctx.periods.assertAcceptsPostings.mockImplementation(() => {
        throw new BadRequestException('Kỳ đã khóa');
      });

      await expect(
        ctx.service.create(
          {
            idempotencyKey: 'pi_key_1',
            partyId: PARTY_ID,
            amount: '1500000.0000',
            method: PaymentMethod.BANK_TRANSFER,
          },
          'user-maker',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ctx.provider.charge).not.toHaveBeenCalled();
      expect(ctx.intents.save).not.toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    it('timeout rồi captured ⇒ ghi sổ đúng MỘT bút toán, source_id = intent id', async () => {
      const ctx = build(intent());

      const result = await ctx.service.poll(INTENT_ID, 'user-poster');

      expect(result.outcome).toBe('captured');
      expect(result.posted).toBe(true);
      expect(ctx.journals.postDocument).toHaveBeenCalledTimes(1);

      const call = ctx.journals.postDocument.mock.calls[0];
      const dto = call?.[0] as Record<string, unknown>;
      const actorId = call?.[1] as string;
      expect(dto.sourceType).toBe(SourceType.PROVIDER_EVENT);
      expect(dto.sourceId).toBe(INTENT_ID);
      expect(dto.date).toBe('2026-10-19');
      expect(actorId).toBe('user-poster');

      const lines = dto.lines as Array<Record<string, unknown>>;
      expect(lines[0]).toMatchObject({ accountId: 'acc-112', debit: '1500000.0000' });
      expect(lines[1]).toMatchObject({
        accountId: 'acc-131',
        credit: '1500000.0000',
        partyId: PARTY_ID,
      });

      // Trạng thái được cập nhật trong CÙNG transaction với bút toán.
      expect(ctx.managerUpdate).toHaveBeenCalledWith(
        PaymentIntent,
        INTENT_ID,
        expect.objectContaining({
          status: PaymentIntentStatus.CAPTURED,
          journalEntryId: 'entry-1',
        }),
      );

      const stored = ctx.store.get(INTENT_ID);
      expect(stored?.status).toBe(PaymentIntentStatus.CAPTURED);
      expect(stored?.journalEntryId).toBe('entry-1');
    });

    it('đã captured ⇒ không gọi provider và không ghi sổ lần hai', async () => {
      const ctx = build(
        intent({ status: PaymentIntentStatus.CAPTURED, journalEntryId: 'entry-1' }),
      );

      const result = await ctx.service.poll(INTENT_ID, 'user-poster');

      expect(result.outcome).toBeNull();
      expect(ctx.provider.fetch).not.toHaveBeenCalled();
      expect(ctx.journals.postDocument).not.toHaveBeenCalled();
    });

    it('quá ngưỡng tra cứu ⇒ leo thang đúng một lần (ngoại lệ + thông báo) rồi dừng tự động', async () => {
      process.env.PAYMENT_INTENT_MAX_POLLS = '3';
      const ctx = build(intent({ attempts: 2 }));
      ctx.provider.fetch.mockResolvedValue({
        outcome: 'unknown',
        providerRef: 'sim_key_1',
        providerStatus: 'timeout',
        message: 'chưa có kết luận',
        raw: null,
      });

      const first = await ctx.service.poll(INTENT_ID, 'user-poster');
      expect(first.escalated).toBe(true);
      expect(ctx.exceptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ReconciliationExceptionType.UNRESOLVED_PROVIDER_STATUS,
          paymentIntentId: INTENT_ID,
        }),
      );
      expect(ctx.notifications.create).toHaveBeenCalledTimes(1);
      expect(ctx.store.get(INTENT_ID)?.escalationNotifiedAt).toBeInstanceOf(Date);

      const second = await ctx.service.poll(INTENT_ID, 'user-poster');
      expect(second.escalated).toBe(false);
      expect(ctx.notifications.create).toHaveBeenCalledTimes(1);
      expect(ctx.exceptions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('webhook payment.captured', () => {
    it('áp kết quả trong cùng transaction, ghi công hệ thống và chỉ một bút toán', async () => {
      const ctx = build(intent());
      ctx.service.onModuleInit();
      const handler = ctx.handlers.get('payment.captured');
      expect(handler).toBeDefined();

      await handler?.({
        externalId: 'evt_1',
        eventType: 'payment.captured',
        resourceRef: INTENT_ID,
        occurredAt: new Date('2026-10-19T02:00:00Z'),
        payload: {
          id: 'evt_1',
          eventType: 'payment.captured',
          resourceRef: INTENT_ID,
          occurredAt: '2026-10-19T02:00:00Z',
          data: { amount: '1500000.0000', providerRef: 'sim_key_1' },
        },
      });

      expect(ctx.journals.postDocument).toHaveBeenCalledTimes(1);
      expect(ctx.journals.postDocument.mock.calls[0]?.[1]).toBe(SYSTEM_ACTOR_ID);
      expect(ctx.store.get(INTENT_ID)?.status).toBe(PaymentIntentStatus.CAPTURED);

      // Cùng sự kiện/cùng kết luận gửi lại: không sinh bút toán thứ hai.
      await handler?.({
        externalId: 'evt_2',
        eventType: 'payment.captured',
        resourceRef: INTENT_ID,
        occurredAt: new Date('2026-10-19T02:01:00Z'),
        payload: { data: { amount: '1500000.0000' } },
      });
      expect(ctx.journals.postDocument).toHaveBeenCalledTimes(1);
      expect(ctx.exceptions.create).not.toHaveBeenCalled();
    });

    it('kết quả đến trễ mâu thuẫn trạng thái cuối ⇒ KHÔNG ghi đè, sinh ngoại lệ', async () => {
      const ctx = build(
        intent({ status: PaymentIntentStatus.FAILED, providerStatus: 'failed' }),
      );
      ctx.service.onModuleInit();

      const result = await ctx.service.applyInboundEvent({
        externalId: 'evt_late',
        eventType: 'payment.captured',
        resourceRef: INTENT_ID,
        occurredAt: new Date('2026-10-19T03:00:00Z'),
        payload: { data: { amount: '1500000.0000' } },
      });

      expect(result.applied).toBe(true);
      expect(ctx.store.get(INTENT_ID)?.status).toBe(PaymentIntentStatus.FAILED);
      expect(ctx.journals.postDocument).not.toHaveBeenCalled();
      expect(ctx.exceptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ReconciliationExceptionType.LATE_EVENT_CONFLICT,
          paymentIntentId: INTENT_ID,
          externalRef: 'evt_late',
          detail: expect.objectContaining({
            previousStatus: PaymentIntentStatus.FAILED,
            incomingOutcome: 'captured',
          }),
        }),
      );
    });

    it('số tiền trong sự kiện lệch intent ⇒ không ghi sổ, ghi ngoại lệ amount_mismatch', async () => {
      const ctx = build(intent());

      const result = await ctx.service.applyInboundEvent({
        externalId: 'evt_mismatch',
        eventType: 'payment.captured',
        resourceRef: INTENT_ID,
        occurredAt: new Date('2026-10-19T04:00:00Z'),
        payload: { data: { amount: '999000.0000' } },
      });

      expect(result.applied).toBe(false);
      expect(ctx.journals.postDocument).not.toHaveBeenCalled();
      expect(ctx.exceptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ReconciliationExceptionType.AMOUNT_MISMATCH,
          paymentIntentId: INTENT_ID,
          externalRef: 'evt_mismatch',
        }),
      );
    });

    it('webhook trỏ tới intent không tồn tại ⇒ bỏ qua, không ném lỗi', async () => {
      const ctx = build(intent());

      const result = await ctx.service.applyInboundEvent({
        externalId: 'evt_unknown',
        eventType: 'payment.captured',
        resourceRef: '33333333-3333-4333-8333-333333333333',
        occurredAt: new Date(),
        payload: {},
      });

      expect(result.applied).toBe(false);
      expect(ctx.journals.postDocument).not.toHaveBeenCalled();
    });
  });

  describe('settle', () => {
    it('chỉ captured mới đánh dấu về tài khoản', async () => {
      const ctx = build(intent({ status: PaymentIntentStatus.UNKNOWN }));

      await expect(
        ctx.service.settle(INTENT_ID, 'user-poster'),
      ).rejects.toBeInstanceOf(BadRequestException);

      const captured = build(
        intent({ status: PaymentIntentStatus.CAPTURED, journalEntryId: 'entry-1' }),
      );
      const settled = await captured.service.settle(INTENT_ID, 'user-poster');

      expect(settled.status).toBe(PaymentIntentStatus.SETTLED);
      expect(settled.settledAt).toBeInstanceOf(Date);
      expect(settled.journalEntryId).toBe('entry-1');
    });
  });
});
