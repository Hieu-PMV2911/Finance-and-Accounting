import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import type {
  InboundEventContext,
  InboundEventHandler,
  InboundEventOutcome,
} from '../jobs/interfaces/inbound-event-handler.interface.js';
import { InboundEventRegistry } from '../jobs/inbound-event-registry.service.js';
import { PaymentIntentsService } from './payment-intents.service.js';
import { isProviderPaymentEventType } from './enums/provider-event.enum.js';

/**
 * Handler webhook thanh toán (mục 10.B) — cầu nối giữa hạ tầng webhook (mục 9) và
 * vòng đời thanh toán.
 *
 * Vì sao là một provider riêng chứ không nhét vào `PaymentIntentsService`: việc
 * *đăng ký* là mối quan tâm của tầng khởi tạo module, còn *nghiệp vụ* là của
 * service. Tách ra thì `PaymentIntentsService` vẫn dùng được độc lập (unit test
 * không cần registry), và việc đăng ký chỉ xảy ra một lần ở `onModuleInit`.
 */
@Injectable()
export class PaymentInboundHandler implements InboundEventHandler, OnModuleInit {
  readonly name = 'payment-inbound';

  private readonly logger = new Logger(PaymentInboundHandler.name);

  constructor(
    private readonly registry: InboundEventRegistry,
    private readonly intents: PaymentIntentsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return isProviderPaymentEventType(eventType);
  }

  async handle(context: InboundEventContext): Promise<InboundEventOutcome> {
    this.logger.debug(
      `Nhận sự kiện ${context.eventType} (${context.externalId}) cho "${context.resourceRef}"`,
    );
    return this.intents.handleProviderEvent(context);
  }
}
