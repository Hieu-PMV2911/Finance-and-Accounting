import { Injectable, Logger } from '@nestjs/common';

import type {
  InboundEventContext,
  InboundEventHandler,
  InboundEventOutcome,
} from './interfaces/inbound-event-handler.interface.js';

/**
 * Sổ đăng ký các **handler webhook nhận vào** (xem `InboundEventHandler`).
 *
 * Vì sao dùng registry thay vì inject trực tiếp: module nghiệp vụ (thanh toán,
 * đối soát) cần `QueueService`/`WebhooksService` của `JobsModule`, nên `JobsModule`
 * **không thể** import ngược lại chúng. Registry đảo chiều phụ thuộc: module
 * nghiệp vụ tự đăng ký khi khởi tạo.
 *
 * Một sự kiện có thể được nhiều handler xử lý (vd vừa cập nhật intent vừa ghi vết);
 * handler lỗi **không** làm sập các handler khác — lỗi được ghi log và trả về
 * trong kết quả, còn sự kiện đã được lưu an toàn ở `webhook_events` từ trước.
 */
@Injectable()
export class InboundEventRegistry {
  private readonly logger = new Logger(InboundEventRegistry.name);
  private readonly handlers: InboundEventHandler[] = [];

  register(handler: InboundEventHandler): void {
    if (this.handlers.some((existing) => existing.name === handler.name)) {
      return;
    }
    this.handlers.push(handler);
    this.logger.log(`Đã đăng ký handler webhook nhận vào: ${handler.name}`);
  }

  /** Tên các handler đã đăng ký — phục vụ chẩn đoán/tài liệu. */
  listHandlers(): string[] {
    return this.handlers.map((handler) => handler.name);
  }

  async dispatch(context: InboundEventContext): Promise<InboundEventOutcome[]> {
    const applicable = this.handlers.filter((handler) =>
      handler.supports(context.eventType),
    );
    if (applicable.length === 0) {
      this.logger.debug(
        `Không có handler nào cho sự kiện "${context.eventType}" (${context.externalId})`,
      );
      return [];
    }

    const outcomes: InboundEventOutcome[] = [];
    for (const handler of applicable) {
      try {
        outcomes.push(await handler.handle(context));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Handler "${handler.name}" lỗi khi xử lý sự kiện ${context.externalId}: ${message}`,
        );
        outcomes.push({ handled: false, detail: { error: message } });
      }
    }
    return outcomes;
  }
}
