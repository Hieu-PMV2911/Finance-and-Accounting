import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { QueryReconciliationExceptionsDto } from './dto/query-reconciliation-exceptions.dto.js';
import type { ResolveExceptionDto } from './dto/query-reconciliation-exceptions.dto.js';
import { ReconciliationException } from './entities/reconciliation-exception.entity.js';
import {
  RECONCILIATION_EXCEPTION_TYPE_LABELS,
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from './enums/reconciliation-exception.enum.js';

export interface CreateExceptionInput {
  type: ReconciliationExceptionType;
  /** Intent liên quan (nếu có). */
  paymentIntentId?: string | null;
  /** Khóa chống trùng phía hệ thống ngoài (event id, mã giao dịch…). */
  externalRef?: string | null;
  /** Bằng chứng: trạng thái trước/sau, số tiền hai bên, payload provider… */
  detail?: Record<string, unknown> | null;
}

/**
 * Hàng đợi ngoại lệ đối soát (mục 10.B).
 *
 * Nguyên tắc: khi hai nguồn sự thật nói khác nhau, **không** đoán. Service này
 * chỉ ghi lại bằng chứng và để trạng thái `open` cho con người quyết định —
 * nhờ vậy mọi nhánh "không chắc" trong luồng thanh toán đều dừng ở một bản ghi
 * nhìn thấy được, thay vì một dòng log rồi biến mất.
 *
 * Chống trùng: cùng `(type, externalRef)` hoặc cùng `(type, intent)` đang mở thì
 * trả về bản ghi cũ. Một sự kiện lặp lại (provider retry webhook, cron chạy lại)
 * không được sinh hàng chục ngoại lệ giống nhau.
 */
@Injectable()
export class ReconciliationExceptionsService {
  private readonly logger = new Logger(ReconciliationExceptionsService.name);

  constructor(
    @InjectRepository(ReconciliationException)
    private readonly exceptions: Repository<ReconciliationException>,
  ) {}

  async create(input: CreateExceptionInput): Promise<ReconciliationException> {
    const existing = await this.findOpenDuplicate(input);
    if (existing) {
      return existing;
    }

    const created = this.exceptions.create({
      type: input.type,
      status: ReconciliationExceptionStatus.OPEN,
      paymentIntentId: input.paymentIntentId ?? null,
      externalRef: input.externalRef ?? null,
      detail: input.detail ?? null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
    });

    try {
      const saved = await this.exceptions.save(created);
      this.logger.warn(
        `Ngoại lệ đối soát mới: ${RECONCILIATION_EXCEPTION_TYPE_LABELS[input.type]}${
          input.externalRef ? ` (${input.externalRef})` : ''
        }`,
      );
      return saved;
    } catch (error) {
      // Đua nhau ghi cùng ngoại lệ ⇒ dùng bản ghi đã thắng.
      const raced = await this.findOpenDuplicate(input);
      if (raced) return raced;
      throw error;
    }
  }

  async list(
    query: QueryReconciliationExceptionsDto = {},
  ): Promise<ReconciliationException[]> {
    const qb = this.exceptions
      .createQueryBuilder('exception')
      .orderBy('exception.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('exception.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('exception.status = :status', { status: query.status });
    }
    if (query.paymentIntentId) {
      qb.andWhere('exception.paymentIntentId = :paymentIntentId', {
        paymentIntentId: query.paymentIntentId,
      });
    }

    return qb.take(query.limit ?? 100).getMany();
  }

  async findById(id: string): Promise<ReconciliationException> {
    const found = await this.exceptions.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException('Không tìm thấy ngoại lệ đối soát');
    }
    return found;
  }

  /** Đánh dấu đã xử lý (có ghi chú giải thích quyết định). */
  async resolve(
    id: string,
    dto: ResolveExceptionDto,
    actorId: string,
  ): Promise<ReconciliationException> {
    return this.close(id, ReconciliationExceptionStatus.RESOLVED, dto, actorId);
  }

  /** Đánh dấu bỏ qua — vẫn lưu người quyết định và lý do. */
  async ignore(
    id: string,
    dto: ResolveExceptionDto,
    actorId: string,
  ): Promise<ReconciliationException> {
    return this.close(id, ReconciliationExceptionStatus.IGNORED, dto, actorId);
  }

  /** Số ngoại lệ còn mở — dùng cho cảnh báo vận hành. */
  countOpen(): Promise<number> {
    return this.exceptions.count({
      where: { status: ReconciliationExceptionStatus.OPEN },
    });
  }

  private async close(
    id: string,
    status: ReconciliationExceptionStatus,
    dto: ResolveExceptionDto,
    actorId: string,
  ): Promise<ReconciliationException> {
    const exception = await this.findById(id);

    if (exception.status !== ReconciliationExceptionStatus.OPEN) {
      throw new BadRequestException('Ngoại lệ này đã được xử lý trước đó');
    }

    exception.status = status;
    exception.resolvedBy = actorId;
    exception.resolvedAt = new Date();
    exception.resolutionNote = dto.note?.trim() || null;

    return this.exceptions.save(exception);
  }

  private findOpenDuplicate(
    input: CreateExceptionInput,
  ): Promise<ReconciliationException | null> {
    if (input.externalRef) {
      return this.exceptions.findOne({
        where: {
          type: input.type,
          externalRef: input.externalRef,
          status: ReconciliationExceptionStatus.OPEN,
        },
      });
    }
    if (input.paymentIntentId) {
      return this.exceptions.findOne({
        where: {
          type: input.type,
          paymentIntentId: input.paymentIntentId,
          status: ReconciliationExceptionStatus.OPEN,
        },
      });
    }
    return Promise.resolve(null);
  }
}
