import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import type { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto.js';
import type { EmitWebhookEventDto } from './dto/emit-webhook-event.dto.js';
import type { QueryWebhookDeliveriesDto } from './dto/query-webhook-deliveries.dto.js';
import type { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto.js';
import type {
  InboundWebhookHandler,
  InboundWebhookHandlerInput,
} from './interfaces/inbound-webhook.interface.js';
import { WebhookDelivery } from './entities/webhook-delivery.entity.js';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { JobName, JobQueue, JobTrigger } from './enums/job.enum.js';
import {
  WEBHOOK_SIGNATURE_PREFIX,
  WebhookDeliveryStatus,
  WebhookEventStatus,
  WebhookEventType,
} from './enums/webhook.enum.js';
import { QueueService } from './queue.service.js';

/** Endpoint trả ra API — **không bao giờ** kèm `secret`. */
export interface WebhookEndpointView {
  id: string;
  name: string;
  url: string;
  /** `[]` = nhận mọi sự kiện. */
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryView {
  id: string;
  endpointId: string;
  endpointName: string | null;
  endpointUrl: string | null;
  eventType: WebhookEventType;
  idempotencyKey: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  responseStatus: number | null;
  responseBody: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookStats {
  activeEndpoints: number;
  totalEndpoints: number;
  pendingDeliveries: number;
  failedDeliveries: number;
  eventsReceived: number;
  lateEvents: number;
}

/** Kết quả một lần thử giao webhook (worker gọi). */
export interface DeliveryAttemptResult {
  delivered: boolean;
  responseStatus: number | null;
  /** Lý do bỏ qua (đã giao rồi, endpoint tắt/không còn…). */
  skippedReason: string | null;
}

export interface OutboundWebhookInput {
  eventType: WebhookEventType;
  resourceRef?: string | null;
  data?: Record<string, unknown>;
  /** Chỉ gửi tới các endpoint này (bỏ trống = mọi endpoint đăng ký). */
  endpointIds?: string[];
  trigger?: JobTrigger;
  actor?: AuthUser | null;
}

/** Webhook nhận từ hệ thống ngoài. */
export interface InboundWebhookInput {
  /** Body thô (để kiểm chữ ký) — `NestFactory.create(..., { rawBody: true })`. */
  rawBody: Buffer | undefined;
  signature: string | undefined;
  body: unknown;
}

export interface InboundWebhookResult {
  accepted: boolean;
  status: WebhookEventStatus;
  reason: string | null;
  eventId: string | null;
}

/** Thời gian chờ tối đa một lần gọi HTTP. */
const DELIVERY_TIMEOUT_MS = 10_000;
/** Backoff cơ sở khi giao lỗi (ms) — dùng cho `nextAttemptAt`. */
const DELIVERY_BACKOFF_MS = 3_000;
/** Số ký tự body lỗi lưu lại. */
const MAX_RESPONSE_BODY = 2_000;

/**
 * Webhook (mục 9).
 *
 * Ba phần:
 * 1. **Endpoint** (`webhook_endpoints`) — đăng ký nơi nhận, kèm khóa ký HMAC.
 * 2. **Giao ra ngoài** (`webhook_deliveries`) — mỗi sự kiện tạo một dòng giao
 *    cho từng endpoint đăng ký, rồi đẩy job `deliver-webhook` vào hàng đợi.
 *    Thất bại thì BullMQ retry theo backoff; dòng giao ghi lại mã trạng thái và
 *    lỗi để người vận hành nhìn thấy.
 * 3. **Nhận vào** (`webhook_events`) — xử lý idempotency (trùng lặp) và
 *    **kết quả đến trễ**: sự kiện cũ tới sau sự kiện mới hơn của cùng đối tượng
 *    thì được lưu lại nhưng **không** áp vào nghiệp vụ.
 *
 * Chữ ký: `sha256=<hex>` của HMAC-SHA256(raw body, secret). Bên nhận tính lại
 * và so sánh bằng `timingSafeEqual` — cách này chống cả sửa nội dung lẫn tấn
 * công đo thời gian.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /**
   * Handler nghiệp vụ theo `eventType` — đăng ký từ module sở hữu dữ liệu.
   *
   * Map (không phải mảng) vì mỗi loại sự kiện chỉ nên có **một** nơi xử lý;
   * hai nơi cùng áp một sự kiện là hai nguồn sự thật, đúng thứ mục 10.B tránh.
   */
  private readonly inboundHandlers = new Map<string, InboundWebhookHandler>();

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpoints: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveries: Repository<WebhookDelivery>,
    @InjectRepository(WebhookEvent)
    private readonly events: Repository<WebhookEvent>,
    private readonly queue: QueueService,
  ) {}

  /**
   * Đăng ký xử lý nghiệp vụ cho một loại sự kiện nhận vào.
   *
   * Gọi ở `onModuleInit` của module nghiệp vụ. Đăng ký lại cùng `eventType` sẽ
   * ghi đè — có chủ đích để test có thể thay handler.
   */
  registerInboundHandler(
    eventType: string,
    handler: InboundWebhookHandler,
  ): void {
    this.inboundHandlers.set(eventType, handler);
  }

  // ------------------------------------------------------------- endpoint

  async listEndpoints(): Promise<WebhookEndpointView[]> {
    const rows = await this.endpoints.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toEndpointView(row));
  }

  async findEndpoint(id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.endpoints.findOne({ where: { id } });
    if (!endpoint) {
      throw new NotFoundException('Không tìm thấy endpoint webhook');
    }
    return endpoint;
  }

  async createEndpoint(
    dto: CreateWebhookEndpointDto,
    actor: AuthUser,
  ): Promise<WebhookEndpointView> {
    const endpoint = this.endpoints.create({
      name: dto.name.trim(),
      url: dto.url.trim(),
      secret: dto.secret ?? randomBytes(24).toString('hex'),
      events: (dto.events ?? []).join(','),
      isActive: dto.isActive ?? true,
      createdBy: actor.id,
    });

    const saved = await this.endpoints.save(endpoint);
    return this.toEndpointView(saved);
  }

  async updateEndpoint(
    id: string,
    dto: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpointView> {
    const endpoint = await this.findEndpoint(id);

    if (dto.name !== undefined) endpoint.name = dto.name.trim();
    if (dto.url !== undefined) endpoint.url = dto.url.trim();
    if (dto.secret !== undefined) endpoint.secret = dto.secret;
    if (dto.events !== undefined) endpoint.events = dto.events.join(',');
    if (dto.isActive !== undefined) endpoint.isActive = dto.isActive;

    const saved = await this.endpoints.save(endpoint);
    return this.toEndpointView(saved);
  }

  /**
   * Xóa endpoint.
   *
   * Nhật ký giao (`webhook_deliveries`) **được giữ lại**: đó là bằng chứng đã
   * gửi gì cho ai, xóa đi là mất khả năng đối chiếu.
   */
  async removeEndpoint(id: string): Promise<void> {
    const endpoint = await this.findEndpoint(id);
    await this.endpoints.remove(endpoint);
  }

  // -------------------------------------------------------- giao ra ngoài

  async listDeliveries(
    query: QueryWebhookDeliveriesDto = {},
  ): Promise<WebhookDeliveryView[]> {
    const qb = this.deliveries
      .createQueryBuilder('d')
      .orderBy('d.createdAt', 'DESC')
      .take(query.limit ?? 50)
      .skip(query.offset ?? 0);

    if (query.endpointId) {
      qb.andWhere('d.endpointId = :endpointId', { endpointId: query.endpointId });
    }
    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }

    const rows = await qb.getMany();
    if (rows.length === 0) return [];

    // Nạp endpoint bằng một truy vấn riêng: ghép join + phân trang trong một
    // câu dễ làm lệch thứ tự raw/entity, trong khi nhu cầu ở đây rất đơn giản.
    const endpoints = await this.endpoints.find({
      where: rows.map((row) => ({ id: row.endpointId })),
    });
    const byId = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));

    return rows.map((delivery) => {
      const endpoint = byId.get(delivery.endpointId);
      return this.toDeliveryView(
        delivery,
        endpoint?.name ?? null,
        endpoint?.url ?? null,
      );
    });
  }

  async stats(): Promise<WebhookStats> {
    const [totalEndpoints, activeEndpoints, pendingDeliveries, failedDeliveries, eventsReceived, lateEvents] =
      await Promise.all([
        this.endpoints.count(),
        this.endpoints.count({ where: { isActive: true } }),
        this.deliveries.count({ where: { status: WebhookDeliveryStatus.PENDING } }),
        this.deliveries.count({ where: { status: WebhookDeliveryStatus.FAILED } }),
        this.events.count(),
        this.events.count({ where: { status: WebhookEventStatus.LATE } }),
      ]);

    return {
      totalEndpoints,
      activeEndpoints,
      pendingDeliveries,
      failedDeliveries,
      eventsReceived,
      lateEvents,
    };
  }

  /**
   * Phát một sự kiện ra tất cả endpoint đăng ký (hoặc danh sách chỉ định).
   *
   * Trả về các dòng giao **vừa được tạo**. Sự kiện đã giao thành công cho một
   * endpoint trước đó sẽ bị bỏ qua nhờ `idempotencyKey` duy nhất theo
   * `<sự kiện>:<đối tượng>:<endpoint>` — nên gọi lại hàm này là an toàn.
   */
  async dispatch(input: OutboundWebhookInput): Promise<WebhookDelivery[]> {
    const targets = await this.resolveTargets(input.eventType, input.endpointIds);
    const created: WebhookDelivery[] = [];

    for (const endpoint of targets) {
      const idempotencyKey = [
        input.eventType,
        input.resourceRef ?? 'na',
        endpoint.id,
      ].join(':');

      const existing = await this.deliveries.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        // Đã giao thành công ⇒ không giao lại. Còn đang chờ/thất bại ⇒ để
        // người vận hành quyết định thử lại, tránh nhân đôi khi vô ý.
        continue;
      }

      const delivery = this.deliveries.create({
        endpointId: endpoint.id,
        eventType: input.eventType,
        idempotencyKey,
        payload: {
          resourceRef: input.resourceRef ?? null,
          ...input.data,
        },
        status: WebhookDeliveryStatus.PENDING,
        attempts: 0,
        maxAttempts: 5,
        responseStatus: null,
        responseBody: null,
        lastError: null,
        nextAttemptAt: null,
        deliveredAt: null,
      });

      const saved = await this.saveDelivery(delivery);
      if (!saved) continue;

      await this.queue.enqueue({
        queue: JobQueue.WEBHOOKS,
        jobName: JobName.DELIVER_WEBHOOK,
        payload: { deliveryId: saved.id },
        trigger: input.trigger ?? JobTrigger.SYSTEM,
        actor: input.actor ?? null,
        // `jobId` = id dòng giao ⇒ BullMQ chống giao trùng cùng một dòng.
        jobId: saved.id,
        maxAttempts: saved.maxAttempts,
      });

      created.push(saved);
    }

    return created;
  }

  /** Phát sự kiện theo DTO (dùng cho API thủ công). */
  async emit(dto: EmitWebhookEventDto, actor: AuthUser): Promise<WebhookDelivery[]> {
    return this.dispatch({
      eventType: dto.eventType,
      resourceRef: dto.resourceRef ?? null,
      data: dto.data ?? {},
      endpointIds: dto.endpointIds,
      trigger: JobTrigger.API,
      actor,
    });
  }

  /**
   * Thử lại một lần giao đã thất bại (hoặc bỏ dở).
   *
   * Xoá job cũ khỏi BullMQ (nếu còn) rồi đẩy lại job với **cùng jobId** là id
   * dòng giao — nhờ vậy vẫn giữ được tính chống giao trùng.
   */
  async retryDelivery(id: string): Promise<WebhookDeliveryView> {
    const delivery = await this.deliveries.findOne({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Không tìm thấy lần giao webhook');
    }
    if (delivery.status === WebhookDeliveryStatus.DELIVERED) {
      throw new BadRequestException('Webhook này đã giao thành công');
    }

    const queue = this.queue.queueOf(JobQueue.WEBHOOKS);
    const existing = await queue.getJob(delivery.id);
    if (existing) {
      await existing.remove();
    }

    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.nextAttemptAt = null;
    await this.deliveries.save(delivery);

    await this.queue.enqueue({
      queue: JobQueue.WEBHOOKS,
      jobName: JobName.DELIVER_WEBHOOK,
      payload: { deliveryId: delivery.id },
      trigger: JobTrigger.API,
      jobId: delivery.id,
      maxAttempts: delivery.maxAttempts,
    });

    const endpoint = await this.endpoints.findOne({
      where: { id: delivery.endpointId },
    });

    return this.toDeliveryView(
      delivery,
      endpoint?.name ?? null,
      endpoint?.url ?? null,
    );
  }

  /**
   * Thực hiện một lần giao webhook (worker gọi).
   *
   * Ném lỗi khi giao thất bại để BullMQ retry theo backoff — đó là lý do hàm
   * **không** tự nuốt lỗi.
   */
  async deliverOne(deliveryId: string): Promise<DeliveryAttemptResult> {
    const delivery = await this.deliveries.findOne({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Không tìm thấy lần giao webhook');
    }
    if (delivery.status === WebhookDeliveryStatus.DELIVERED) {
      return { delivered: true, responseStatus: delivery.responseStatus, skippedReason: 'already-delivered' };
    }

    const endpoint = await this.endpoints.findOne({
      where: { id: delivery.endpointId },
    });
    if (!endpoint) {
      await this.markFailed(delivery.id, delivery.attempts, 'Endpoint đã bị xóa');
      return { delivered: false, responseStatus: null, skippedReason: 'endpoint-not-found' };
    }
    if (!endpoint.isActive) {
      await this.markFailed(delivery.id, delivery.attempts, 'Endpoint đang tắt');
      return { delivered: false, responseStatus: null, skippedReason: 'endpoint-inactive' };
    }

    const body = JSON.stringify({
      id: delivery.id,
      eventType: delivery.eventType,
      idempotencyKey: delivery.idempotencyKey,
      occurredAt: delivery.createdAt.toISOString(),
      data: delivery.payload,
    });

    const attempt = delivery.attempts + 1;
    let responseStatus: number | null = null;
    let responseBody = '';
    let failure: string | null = null;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-id': delivery.id,
          'x-webhook-event': delivery.eventType,
          'x-webhook-attempt': String(attempt),
          'x-webhook-signature': this.sign(endpoint.secret, body),
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      responseStatus = response.status;
      responseBody = (await response.text()).slice(0, MAX_RESPONSE_BODY);
      if (!response.ok) {
        failure = `Endpoint trả về HTTP ${response.status}`;
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Lỗi không xác định khi gọi webhook';
    }

    if (failure === null) {
      await this.deliveries.update(
        { id: delivery.id },
        {
          status: WebhookDeliveryStatus.DELIVERED,
          attempts: attempt,
          responseStatus,
          responseBody,
          lastError: null,
          nextAttemptAt: null,
          deliveredAt: new Date(),
        },
      );
      this.logger.log(
        `Đã giao webhook ${delivery.eventType} (${delivery.id}) → ${endpoint.url} [${responseStatus}]`,
      );
      return { delivered: true, responseStatus, skippedReason: null };
    }

    const exhausted = attempt >= delivery.maxAttempts;
    await this.deliveries.update(
      { id: delivery.id },
      {
        status: exhausted ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
        attempts: attempt,
        responseStatus,
        responseBody: responseBody || null,
        lastError: failure.slice(0, MAX_RESPONSE_BODY),
        nextAttemptAt: exhausted
          ? null
          : new Date(Date.now() + DELIVERY_BACKOFF_MS * 2 ** (attempt - 1)),
      },
    );

    throw new Error(failure);
  }

  /**
   * Quét các lần giao còn `pending` nhưng **không có job sống** trong BullMQ
   * (vd job bị mất khi tiến trình restart) rồi đẩy lại.
   *
   * Chỉ đụng tới `pending`; giao thất bại đã có BullMQ retry lo, còn hết lượt
   * thì người vận hành bấm "Thử lại" (có chủ đích, không tự động gửi lại dữ liệu
   * sang hệ thống khác).
   */
  async sweepPending(limit = 100): Promise<number> {
    const pending = await this.deliveries.find({
      where: { status: WebhookDeliveryStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    const queue = this.queue.queueOf(JobQueue.WEBHOOKS);
    let requeued = 0;

    for (const delivery of pending) {
      const existing = await queue.getJob(delivery.id);
      if (existing) continue;

      await this.queue.enqueue({
        queue: JobQueue.WEBHOOKS,
        jobName: JobName.DELIVER_WEBHOOK,
        payload: { deliveryId: delivery.id },
        trigger: JobTrigger.SCHEDULE,
        jobId: delivery.id,
        maxAttempts: delivery.maxAttempts,
      });
      requeued += 1;
    }

    if (requeued > 0) {
      this.logger.warn(`Đã đẩy lại ${requeued} webhook còn treo`);
    }
    return requeued;
  }

  // -------------------------------------------------------- nhận vào

  async listEvents(limit = 50): Promise<WebhookEvent[]> {
    return this.events.find({ order: { receivedAt: 'DESC' }, take: limit });
  }

  /**
   * Nhận webhook từ hệ thống ngoài.
   *
   * Thứ tự kiểm tra (mỗi bước đều dừng lại ngay khi không đạt):
   * 1. Envelope đủ trường (`id`, `eventType`, `resourceRef`, `occurredAt`).
   * 2. Chữ ký HMAC hợp lệ (nếu cấu hình `WEBHOOK_INBOUND_SECRET`).
   * 3. `id` chưa từng nhận → trùng lặp thì trả 200 để bên gửi ngừng retry.
   * 4. `occurredAt` không cũ hơn sự kiện mới nhất đã xử lý của cùng
   *    `resourceRef` → cũ hơn là **kết quả đến trễ**, lưu lại nhưng bỏ qua.
   */
  async receiveInbound(input: InboundWebhookInput): Promise<InboundWebhookResult> {
    const payload = asRecord(input.body);
    const externalId = asText(payload.id);
    const eventType = asText(payload.eventType);
    const resourceRef = asText(payload.resourceRef);
    const occurredAt = asText(payload.occurredAt);

    if (!externalId) {
      return {
        accepted: false,
        status: WebhookEventStatus.REJECTED,
        reason: 'Thiếu trường "id" của sự kiện',
        eventId: null,
      };
    }

    if (!eventType || !resourceRef || !occurredAt) {
      return this.storeEvent({
        externalId,
        eventType: eventType ?? 'unknown',
        resourceRef: resourceRef ?? 'unknown',
        occurredAt: new Date(),
        status: WebhookEventStatus.REJECTED,
        reason: 'Thiếu eventType / resourceRef / occurredAt',
        payload,
      });
    }

    const parsedOccurredAt = new Date(occurredAt);
    if (Number.isNaN(parsedOccurredAt.getTime())) {
      return this.storeEvent({
        externalId,
        eventType,
        resourceRef,
        occurredAt: new Date(),
        status: WebhookEventStatus.REJECTED,
        reason: 'occurredAt không phải thời điểm hợp lệ',
        payload,
      });
    }

    const secret = process.env.WEBHOOK_INBOUND_SECRET?.trim();
    if (secret) {
      if (!input.rawBody || !this.verifySignature(secret, input.rawBody, input.signature)) {
        return this.storeEvent({
          externalId,
          eventType,
          resourceRef,
          occurredAt: parsedOccurredAt,
          status: WebhookEventStatus.REJECTED,
          reason: 'Chữ ký không hợp lệ',
          payload,
        });
      }
    } else {
      this.logger.warn(
        'WEBHOOK_INBOUND_SECRET chưa được cấu hình — bỏ qua kiểm tra chữ ký webhook nhận vào',
      );
    }

    const duplicate = await this.events.findOne({ where: { externalId } });
    if (duplicate) {
      return {
        accepted: true,
        status: WebhookEventStatus.DUPLICATE,
        reason: 'Sự kiện đã được nhận trước đó',
        eventId: duplicate.id,
      };
    }

    const newer = await this.events.findOne({
      where: {
        resourceRef,
        status: WebhookEventStatus.PROCESSED,
        occurredAt: MoreThan(parsedOccurredAt),
      },
      order: { occurredAt: 'DESC' },
    });

    const lateReason = newer
      ? `Đã có sự kiện mới hơn cho "${resourceRef}" (${newer.externalId} lúc ${newer.occurredAt.toISOString()})`
      : null;

    // Nghiệp vụ chạy **trước** khi lưu: handler lỗi ⇒ chưa có bản ghi, bên gửi
    // retry; mọi thao tác áp kết quả đều idempotent nên retry an toàn.
    // Sự kiện "đến trễ" vẫn được áp: chính nghiệp vụ biết đó là mâu thuẫn cần
    // ghi ngoại lệ hay chỉ là bản cập nhật cũ vô hại.
    const handler = this.inboundHandlers.get(eventType);
    if (handler) {
      const outcome = await handler({
        externalId,
        eventType,
        resourceRef,
        occurredAt: parsedOccurredAt,
        payload,
      } satisfies InboundWebhookHandlerInput);
      if (outcome.note) {
        this.logger.log(
          `Webhook ${eventType} (${externalId}): ${outcome.note}`,
        );
      }
    }

    return this.storeEvent({
      externalId,
      eventType,
      resourceRef,
      occurredAt: parsedOccurredAt,
      status: lateReason ? WebhookEventStatus.LATE : WebhookEventStatus.PROCESSED,
      reason: lateReason,
      payload,
    });
  }

  /** Ký payload: `sha256=<hex>` của HMAC-SHA256. */
  sign(secret: string, body: string | Buffer): string {
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    return `${WEBHOOK_SIGNATURE_PREFIX}${digest}`;
  }

  /** Xác minh chữ ký, so sánh theo thời gian hằng định. */
  verifySignature(
    secret: string,
    rawBody: Buffer,
    signature: string | undefined,
  ): boolean {
    if (!signature) return false;

    const expected = this.sign(secret, rawBody);
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  // ---------------------------------------------------------------- helpers

  private async resolveTargets(
    eventType: WebhookEventType,
    endpointIds?: string[],
  ): Promise<WebhookEndpoint[]> {
    const rows = await this.endpoints.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });

    return rows.filter((endpoint) => {
      if (endpointIds && endpointIds.length > 0 && !endpointIds.includes(endpoint.id)) {
        return false;
      }
      return endpoint.subscribesTo(eventType);
    });
  }

  /**
   * Lưu dòng giao; `null` nếu bị vi phạm ràng buộc duy nhất (đã có dòng giao
   * cùng khóa) — coi như đã phát rồi, không tạo trùng.
   */
  private async saveDelivery(
    delivery: WebhookDelivery,
  ): Promise<WebhookDelivery | null> {
    try {
      return await this.deliveries.save(delivery);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return null;
      }
      throw error;
    }
  }

  private async markFailed(
    id: string,
    attempts: number,
    reason: string,
  ): Promise<void> {
    await this.deliveries.update(
      { id },
      {
        status: WebhookDeliveryStatus.FAILED,
        attempts,
        lastError: reason,
        nextAttemptAt: null,
      },
    );
  }

  private async storeEvent(input: {
    externalId: string;
    eventType: string;
    resourceRef: string;
    occurredAt: Date;
    status: WebhookEventStatus;
    reason: string | null;
    payload: Record<string, unknown>;
  }): Promise<InboundWebhookResult> {
    const event = this.events.create({
      externalId: input.externalId,
      eventType: input.eventType,
      resourceRef: input.resourceRef,
      occurredAt: input.occurredAt,
      status: input.status,
      reason: input.reason,
      payload: input.payload,
    });

    try {
      const saved = await this.events.save(event);
      return {
        accepted: input.status === WebhookEventStatus.PROCESSED,
        status: input.status,
        reason: input.reason,
        eventId: saved.id,
      };
    } catch (error) {
      // Đua nhau ghi cùng `externalId` ⇒ lần này là trùng lặp.
      const message = error instanceof Error ? error.message : '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        const existing = await this.events.findOne({
          where: { externalId: input.externalId },
        });
        return {
          accepted: true,
          status: WebhookEventStatus.DUPLICATE,
          reason: 'Sự kiện đã được nhận trước đó',
          eventId: existing?.id ?? null,
        };
      }
      throw error;
    }
  }

  private toEndpointView(endpoint: WebhookEndpoint): WebhookEndpointView {
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.subscriptionList(),
      isActive: endpoint.isActive,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
    };
  }

  private toDeliveryView(
    delivery: WebhookDelivery,
    endpointName: string | null,
    endpointUrl: string | null,
  ): WebhookDeliveryView {
    return {
      id: delivery.id,
      endpointId: delivery.endpointId,
      endpointName,
      endpointUrl,
      eventType: delivery.eventType,
      idempotencyKey: delivery.idempotencyKey,
      status: delivery.status,
      attempts: delivery.attempts,
      maxAttempts: delivery.maxAttempts,
      responseStatus: delivery.responseStatus,
      responseBody: delivery.responseBody,
      lastError: delivery.lastError,
      nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
      deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
      updatedAt: delivery.updatedAt.toISOString(),
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
