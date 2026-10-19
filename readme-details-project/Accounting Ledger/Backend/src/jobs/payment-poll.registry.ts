import { Injectable, Logger } from '@nestjs/common';

/**
 * Cổng để worker `payments` gọi nghiệp vụ thanh toán.
 *
 * `JobsModule` **không** import `PaymentIntentsModule` (module kia đã import
 * `JobsModule` để dùng webhook/thông báo — import ngược lại là vòng). Thay vào
 * đó, module thanh toán tự đăng ký hiện thực của mình lúc khởi động:
 *
 * ```ts
 * onModuleInit() { this.polls.register(this); }
 * ```
 *
 * Nhờ vậy mọi worker vẫn nằm một chỗ (`JobsModule`) và tiến trình khởi động sẽ
 * lộ ngay nếu module thanh toán quên đăng ký — job sẽ báo lỗi rõ ràng thay vì
 * im lặng không làm gì.
 */
export interface PaymentStatusPoller {
  pollPending(limit: number): Promise<object>;
}

@Injectable()
export class PaymentPollRegistry {
  private readonly logger = new Logger(PaymentPollRegistry.name);
  private poller: PaymentStatusPoller | null = null;

  register(poller: PaymentStatusPoller): void {
    this.poller = poller;
    this.logger.log('Module thanh toán đã đăng ký tra cứu trạng thái provider');
  }

  get registered(): boolean {
    return this.poller !== null;
  }

  async poll(limit: number): Promise<object> {
    if (!this.poller) {
      throw new Error(
        'Chưa có module thanh toán đăng ký tra cứu provider — kiểm tra PaymentIntentsModule đã được nạp ở AppModule',
      );
    }
    return this.poller.pollPending(limit);
  }
}
