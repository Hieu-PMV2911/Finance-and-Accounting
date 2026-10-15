import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookDelivery } from './entities/webhook-delivery.entity.js';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { JobName, JobQueue } from './enums/job.enum.js';
import {
  WebhookDeliveryStatus,
  WebhookEventStatus,
  WebhookEventType,
} from './enums/webhook.enum.js';
import type { QueueService } from './queue.service.js';
import type { InboundEventRegistry } from './inbound-event-registry.service.js';
import { WebhooksService } from './webhooks.service.js';

/** Endpoint thật (có method `subscribesTo`) nhưng dữ liệu do test quyết định. */
function makeEndpoint(partial: Partial<WebhookEndpoint>): WebhookEndpoint {
  return Object.assign(new WebhookEndpoint(), {
    id: 'e1',
    name: 'Endpoint 1',
    url: 'https://example.test/hooks',
    secret: 'secret-key-123456',
    events: '',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } satisfies Partial<WebhookEndpoint>, partial);
}

function build() {
  const endpoints = {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(),
  };
  const deliveries = {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(),
    update: vi.fn(),
  };
  const events = {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(),
  };
  const queue = { queueOf: vi.fn(), enqueue: vi.fn() };
  // Mục 10.B — sổ đăng ký handler nhận sự kiện vào; test này không kiểm tra
  // phần điều phối nên chỉ cần stub đủ để container dựng được service.
  const inbound = { register: vi.fn(), listHandlers: vi.fn(), dispatch: vi.fn() };

  const service = new WebhooksService(
    endpoints as unknown as Repository<WebhookEndpoint>,
    deliveries as unknown as Repository<WebhookDelivery>,
    events as unknown as Repository<WebhookEvent>,
    queue as unknown as QueueService,
    inbound as unknown as InboundEventRegistry,
  );

  return { service, endpoints, deliveries, events, queue, inbound };
}

describe('WebhooksService', () => {
  beforeEach(() => {
    // Không cấu hình secret ⇒ test chữ ký được bật riêng ở từng ca.
    delete process.env.WEBHOOK_INBOUND_SECRET;
  });

  afterEach(() => {
    delete process.env.WEBHOOK_INBOUND_SECRET;
  });

  describe('chữ ký HMAC', () => {
    it('ký payload và xác minh lại được', () => {
      const { service } = build();
      const body = Buffer.from(JSON.stringify({ hello: 'world' }));

      const signature = service.sign('secret-key-123456', body);

      expect(signature.startsWith('sha256=')).toBe(true);
      expect(service.verifySignature('secret-key-123456', body, signature)).toBe(true);
      expect(service.verifySignature('secret-khác-123456', body, signature)).toBe(false);
      expect(service.verifySignature('secret-key-123456', body, undefined)).toBe(false);
    });

    it('đổi nội dung body thì chữ ký không còn hợp lệ', () => {
      const { service } = build();
      const signature = service.sign('s', Buffer.from('{"amount":"100"}'));

      expect(
        service.verifySignature('s', Buffer.from('{"amount":"999"}'), signature),
      ).toBe(false);
    });
  });

  describe('webhook nhận vào', () => {
    const envelope = {
      id: 'evt-1',
      eventType: 'payment.settled',
      resourceRef: 'INV-2026-001',
      occurredAt: '2026-02-01T10:00:00.000Z',
    };

    it('thiếu id ⇒ từ chối và KHÔNG ghi vào bảng sự kiện', async () => {
      const { service, events } = build();

      const result = await service.receiveInbound({
        rawBody: Buffer.from('{}'),
        signature: undefined,
        body: { eventType: 'x', resourceRef: 'y', occurredAt: '2026-02-01T00:00:00.000Z' },
      });

      expect(result.status).toBe(WebhookEventStatus.REJECTED);
      expect(result.eventId).toBeNull();
      expect(events.save).not.toHaveBeenCalled();
    });

    it('sự kiện mới ⇒ ghi nhận đã xử lý', async () => {
      const { service, events } = build();
      events.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      events.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), id: 'row-1' }),
      );

      const result = await service.receiveInbound({
        rawBody: Buffer.from(JSON.stringify(envelope)),
        signature: undefined,
        body: envelope,
      });

      expect(result.status).toBe(WebhookEventStatus.PROCESSED);
      expect(result.accepted).toBe(true);
      expect(result.eventId).toBe('row-1');
    });

    it('trùng lặp (cùng id sự kiện) ⇒ bỏ qua nhưng vẫn trả 200 để ngừng retry', async () => {
      const { service, events } = build();
      events.findOne.mockResolvedValueOnce({ id: 'row-cũ' });

      const result = await service.receiveInbound({
        rawBody: Buffer.from(JSON.stringify(envelope)),
        signature: undefined,
        body: envelope,
      });

      expect(result.status).toBe(WebhookEventStatus.DUPLICATE);
      expect(result.accepted).toBe(true);
      expect(result.eventId).toBe('row-cũ');
      expect(events.save).not.toHaveBeenCalled();
    });

    it('kết quả đến trễ (đã có sự kiện mới hơn cùng đối tượng) ⇒ lưu lại nhưng bỏ qua', async () => {
      const { service, events } = build();
      events.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'row-mới',
          externalId: 'evt-2',
          occurredAt: new Date('2026-02-02T10:00:00.000Z'),
        });
      events.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), id: 'row-trễ' }),
      );

      const result = await service.receiveInbound({
        rawBody: Buffer.from(JSON.stringify(envelope)),
        signature: undefined,
        body: envelope,
      });

      expect(result.status).toBe(WebhookEventStatus.LATE);
      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('mới hơn');
      expect(events.save).toHaveBeenCalledTimes(1);
    });

    it('bật secret ⇒ chữ ký sai bị từ chối', async () => {
      process.env.WEBHOOK_INBOUND_SECRET = 'inbound-secret';
      const { service, events } = build();
      events.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), id: 'row-sai' }),
      );

      const result = await service.receiveInbound({
        rawBody: Buffer.from(JSON.stringify(envelope)),
        signature: 'sha256=không-đúng',
        body: envelope,
      });

      expect(result.status).toBe(WebhookEventStatus.REJECTED);
      expect(result.reason).toContain('Chữ ký');
      expect(events.findOne).not.toHaveBeenCalled();
    });

    it('bật secret và chữ ký đúng ⇒ xử lý bình thường', async () => {
      process.env.WEBHOOK_INBOUND_SECRET = 'inbound-secret';
      const { service, events } = build();
      const rawBody = Buffer.from(JSON.stringify(envelope));
      events.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      events.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), id: 'row-ok' }),
      );

      const result = await service.receiveInbound({
        rawBody,
        signature: service.sign('inbound-secret', rawBody),
        body: envelope,
      });

      expect(result.status).toBe(WebhookEventStatus.PROCESSED);
    });
  });

  describe('giao ra ngoài', () => {
    it('tạo một dòng giao cho mỗi endpoint đăng ký và xếp job với jobId = id dòng giao', async () => {
      const { service, endpoints, deliveries, queue } = build();
      endpoints.find.mockResolvedValue([
        makeEndpoint({ id: 'e1' }),
        makeEndpoint({ id: 'e2', events: WebhookEventType.PING }),
        makeEndpoint({ id: 'e3', events: WebhookEventType.JOURNAL_POSTED }),
      ]);
      deliveries.findOne.mockResolvedValue(null);
      deliveries.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), id: 'delivery-1' }),
      );
      queue.enqueue.mockResolvedValue({ id: 'run-1' });

      const created = await service.dispatch({
        eventType: WebhookEventType.PING,
        resourceRef: 'INV-1',
      });

      // e3 chỉ đăng ký journal.posted ⇒ không nhận ping.
      expect(created).toHaveLength(2);
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          queue: JobQueue.WEBHOOKS,
          jobName: JobName.DELIVER_WEBHOOK,
          payload: { deliveryId: 'delivery-1' },
          jobId: 'delivery-1',
        }),
      );
    });

    it('sự kiện đã phát trước đó ⇒ không phát lại (chống giao trùng)', async () => {
      const { service, endpoints, deliveries, queue } = build();
      endpoints.find.mockResolvedValue([makeEndpoint({ id: 'e1' })]);
      deliveries.findOne.mockResolvedValue({
        id: 'delivery-cũ',
        status: WebhookDeliveryStatus.DELIVERED,
      });

      const created = await service.dispatch({ eventType: WebhookEventType.PING });

      expect(created).toHaveLength(0);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('endpoint đang tắt ⇒ không sinh dòng giao', async () => {
      const { service, endpoints, deliveries } = build();
      endpoints.find.mockResolvedValue([]);

      const created = await service.dispatch({ eventType: WebhookEventType.PING });

      expect(created).toEqual([]);
      expect(deliveries.save).not.toHaveBeenCalled();
    });

    it('giao vào endpoint đang tắt ⇒ đánh dấu thất bại và không retry', async () => {
      const { service, deliveries, endpoints } = build();
      deliveries.findOne.mockResolvedValue({
        id: 'd1',
        attempts: 0,
        maxAttempts: 5,
        status: WebhookDeliveryStatus.PENDING,
        endpointId: 'e1',
      });
      endpoints.findOne.mockResolvedValue(makeEndpoint({ id: 'e1', isActive: false }));

      const result = await service.deliverOne('d1');

      expect(result.delivered).toBe(false);
      expect(result.skippedReason).toBe('endpoint-inactive');
      expect(deliveries.update).toHaveBeenCalledWith(
        { id: 'd1' },
        expect.objectContaining({ status: WebhookDeliveryStatus.FAILED }),
      );
    });

    it('giao lại một lần đã thành công ⇒ bỏ qua', async () => {
      const { service, deliveries } = build();
      deliveries.findOne.mockResolvedValue({
        id: 'd1',
        attempts: 1,
        maxAttempts: 5,
        status: WebhookDeliveryStatus.DELIVERED,
        responseStatus: 200,
        endpointId: 'e1',
      });

      const result = await service.deliverOne('d1');

      expect(result.delivered).toBe(true);
      expect(result.skippedReason).toBe('already-delivered');
      expect(deliveries.update).not.toHaveBeenCalled();
    });

    it('không thử lại được một lần giao đã thành công', async () => {
      const { service, deliveries } = build();
      deliveries.findOne.mockResolvedValue({
        id: 'd1',
        status: WebhookDeliveryStatus.DELIVERED,
      });

      await expect(service.retryDelivery('d1')).rejects.toThrow(/đã giao thành công/);
    });
  });
});
