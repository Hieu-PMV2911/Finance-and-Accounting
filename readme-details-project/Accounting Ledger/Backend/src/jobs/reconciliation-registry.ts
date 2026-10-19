import { Injectable, Logger } from '@nestjs/common';

/**
 * Cổng để worker `statements` gọi nghiệp vụ đối soát (mục 10.B — P2.2/P2.3).
 *
 * Cùng lý do với `PaymentPollRegistry`: `JobsModule` **không** import
 * `ReconciliationModule` (module kia đã import `JobsModule` để xếp job — import
 * ngược lại là vòng). Module đối soát tự đăng ký hiện thực của mình lúc khởi
 * động; nếu quên đăng ký, job sẽ báo lỗi rõ ràng thay vì im lặng không làm gì.
 */
export interface ReconciliationJobHandlers {
  /** Nạp một lô sao kê (adapter đã chọn theo `source`). */
  importStatement(input: {
    accountId: string;
    source?: string;
    sourceRef?: string;
    statementDate?: string;
    openingBalance?: string;
    closingBalance?: string;
    content: string;
  }): Promise<object>;

  /** Chạy pipeline đối soát 3 tầng cho một sao kê. */
  reconcileStatement(statementId: string): Promise<object>;

  /** Quét mọi sao kê còn `imported` để đối soát bù (cron hằng ngày). */
  catchup(limit: number): Promise<object>;
}

@Injectable()
export class ReconciliationRegistry {
  private readonly logger = new Logger(ReconciliationRegistry.name);
  private handlers: ReconciliationJobHandlers | null = null;

  register(handlers: ReconciliationJobHandlers): void {
    this.handlers = handlers;
    this.logger.log('Module đối soát đã đăng ký xử lý job sao kê');
  }

  get registered(): boolean {
    return this.handlers !== null;
  }

  async importStatement(
    input: Parameters<ReconciliationJobHandlers['importStatement']>[0],
  ): Promise<object> {
    if (!this.handlers) throw this.notRegistered();
    return this.handlers.importStatement(input);
  }

  async reconcileStatement(statementId: string): Promise<object> {
    if (!this.handlers) throw this.notRegistered();
    return this.handlers.reconcileStatement(statementId);
  }

  async catchup(limit: number): Promise<object> {
    if (!this.handlers) throw this.notRegistered();
    return this.handlers.catchup(limit);
  }

  private notRegistered(): Error {
    return new Error(
      'Chưa có module đối soát đăng ký — kiểm tra ReconciliationModule đã được nạp ở AppModule',
    );
  }
}
