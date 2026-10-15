import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import {
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '../common/enums/reconciliation-exception.enum.js';
import type { ReconciliationTargetType } from '../common/enums/reconciliation-target-type.enum.js';
import type { ResolveExceptionDto } from './dto/resolve-exception.dto.js';
import { ReconciliationException } from './entities/reconciliation-exception.entity.js';

export interface RecordExceptionInput {
  type: ReconciliationExceptionType;
  detail: string;
  /** Khóa chống sinh trùng — **bắt buộc**, để chạy lại khớp không nhân đôi danh sách lệch. */
  dedupeKey: string;
  statementId?: string | null;
  statementLineId?: string | null;
  targetType?: ReconciliationTargetType | null;
  targetId?: string | null;
  amount?: string | null;
}

export interface RecordExceptionResult {
  created: boolean;
  exception: ReconciliationException;
}

/**
 * **Danh sách giao dịch lệch** (mục 10.B).
 *
 * Vì sao có `dedupeKey`: job khớp đối soát chạy lại nhiều lần (theo cron, hoặc khi
 * người dùng bấm khớp lại). Nếu mỗi lần chạy lại đẻ thêm một dòng lệch cho cùng
 * một vấn đề thì danh sách lệch thành vô dụng — người đối soát không biết cái nào
 * còn thật sự cần xử lý. Khóa chống trùng làm thao tác khớp **idempotent**.
 */
@Injectable()
export class ReconciliationExceptionsService {
  constructor(
    @InjectRepository(ReconciliationException)
    private readonly exceptions: Repository<ReconciliationException>,
  ) {}

  /** Ghi một dòng lệch; đã có cùng `dedupeKey` ⇒ trả về dòng cũ, không tạo mới. */
  async record(input: RecordExceptionInput): Promise<RecordExceptionResult> {
    const existing = await this.exceptions.findOne({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) {
      return { created: false, exception: existing };
    }

    const entity = this.exceptions.create({
      type: input.type,
      status: ReconciliationExceptionStatus.OPEN,
      statementId: input.statementId ?? null,
      statementLineId: input.statementLineId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      amount: input.amount ?? null,
      detail: input.detail,
      dedupeKey: input.dedupeKey,
      resolutionNote: null,
      resolvedBy: null,
      resolvedAt: null,
    });

    try {
      const saved = await this.exceptions.save(entity);
      return { created: true, exception: saved };
    } catch (error) {
      // Đua nhau ghi cùng khóa ⇒ lần này trùng, trả về bản ghi đã có.
      const raced = await this.exceptions.findOne({
        where: { dedupeKey: input.dedupeKey },
      });
      if (raced) return { created: false, exception: raced };
      throw error;
    }
  }

  async list(filters: {
    status?: ReconciliationExceptionStatus;
    type?: ReconciliationExceptionType;
    statementId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ReconciliationException[]> {
    const qb = this.exceptions
      .createQueryBuilder('ex')
      .orderBy('ex.createdAt', 'DESC')
      .take(filters.limit ?? 50)
      .skip(filters.offset ?? 0);

    if (filters.status) qb.andWhere('ex.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('ex.type = :type', { type: filters.type });
    if (filters.statementId) {
      qb.andWhere('ex.statementId = :statementId', { statementId: filters.statementId });
    }
    return qb.getMany();
  }

  async findById(id: string): Promise<ReconciliationException> {
    const found = await this.exceptions.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException('Không tìm thấy giao dịch lệch');
    }
    return found;
  }

  async countOpen(): Promise<number> {
    return this.exceptions.count({
      where: { status: ReconciliationExceptionStatus.OPEN },
    });
  }

  /** Các dòng lệch **còn mở** của một dòng sao kê (dùng khi khớp thủ công để đóng lệch). */
  async findOpenByStatementLine(
    statementLineId: string,
  ): Promise<ReconciliationException[]> {
    return this.exceptions.find({
      where: {
        statementLineId,
        status: ReconciliationExceptionStatus.OPEN,
      },
      order: { createdAt: 'ASC' },
    });
  }

  /** Đếm theo trạng thái — dùng cho thẻ thống kê trên giao diện. */
  async countByStatus(): Promise<Record<ReconciliationExceptionStatus, number>> {
    const rows = await this.exceptions
      .createQueryBuilder('ex')
      .select('ex.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ex.status')
      .getRawMany<{ status: ReconciliationExceptionStatus; count: string }>();

    const counts: Record<ReconciliationExceptionStatus, number> = {
      [ReconciliationExceptionStatus.OPEN]: 0,
      [ReconciliationExceptionStatus.RESOLVED]: 0,
      [ReconciliationExceptionStatus.IGNORED]: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  /**
   * Xử lý hoặc bỏ qua một dòng lệch.
   *
   * Không có "sửa" hay "xoá": dòng lệch là **bằng chứng** đã có chênh lệch, xoá đi
   * là mất khả năng giải thích về sau. Chỉ được chuyển trạng thái kèm lý do.
   */
  async resolve(
    id: string,
    dto: ResolveExceptionDto,
    actor: AuthUser,
  ): Promise<ReconciliationException> {
    const exception = await this.findById(id);

    exception.status = dto.status;
    exception.resolutionNote = dto.note?.trim() || null;
    exception.resolvedBy = actor.id;
    exception.resolvedAt = new Date();

    return this.exceptions.save(exception);
  }
}
