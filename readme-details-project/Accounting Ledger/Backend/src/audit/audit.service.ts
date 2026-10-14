import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JournalsService } from '../journals/journals.service.js';
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto.js';
import { AuditLog } from './entities/audit-log.entity.js';
import type { JournalTraceability } from './interfaces/traceability.interface.js';

/** Tên bảng của bút toán — dùng làm khóa truy vết. */
const JOURNAL_ENTITY = 'journal_entries';

/** Ngày kế tiếp (`YYYY-MM-DD`) để lọc `created_at < ngày mai` (bao trùm cả ngày `toDate`). */
function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Truy vấn vết kiểm toán & truy vết (mục 8).
 *
 * Việc **ghi** vết do `AuditSubscriber` lo tự động; service này chỉ đọc: tra
 * danh sách có lọc, xem chi tiết một bản ghi, và truy vết một bút toán từ báo
 * cáo ngược về chứng từ nguồn.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
    private readonly journals: JournalsService,
  ) {}

  /** Danh sách vết kiểm toán, mới nhất trước. */
  async list(query: QueryAuditLogsDto = {}): Promise<AuditLog[]> {
    const qb = this.logs
      .createQueryBuilder('audit')
      .orderBy('audit.createdAt', 'DESC')
      .take(query.limit ?? 100)
      .skip(query.offset ?? 0);

    if (query.entity) {
      qb.andWhere('audit.entity = :entity', { entity: query.entity });
    }
    if (query.entityId) {
      qb.andWhere('audit.entityId = :entityId', { entityId: query.entityId });
    }
    if (query.actorId) {
      qb.andWhere('audit.actorId = :actorId', { actorId: query.actorId });
    }
    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }
    if (query.fromDate) {
      qb.andWhere('audit.createdAt >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('audit.createdAt < :toExclusive', {
        toExclusive: nextDay(query.toDate),
      });
    }
    if (query.search) {
      qb.andWhere(
        '(audit.actorEmail ILIKE :s OR audit.entity ILIKE :s OR audit.entityId ILIKE :s OR audit.path ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<AuditLog> {
    const log = await this.logs.findOne({ where: { id } });
    if (!log) {
      throw new NotFoundException('Không tìm thấy bản ghi kiểm toán');
    }
    return log;
  }

  /** Toàn bộ vết của một bản ghi, theo thứ tự thời gian (cũ → mới). */
  async trace(entity: string, entityId: string): Promise<AuditLog[]> {
    return this.logs.find({
      where: { entity, entityId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Truy vết đầy đủ một bút toán: dòng định khoản, kỳ kế toán, **chứng từ nguồn**
   * và vết kiểm toán — trả lời được "con số trên báo cáo này từ đâu ra".
   */
  async traceJournalEntry(id: string): Promise<JournalTraceability> {
    const entry = await this.journals.findById(id);

    const history = await this.logs.find({
      where: { entity: JOURNAL_ENTITY, entityId: id },
      order: { createdAt: 'DESC' },
    });

    return {
      entity: JOURNAL_ENTITY,
      entityId: entry.id,
      journal: {
        id: entry.id,
        entryNo: entry.entryNo,
        date: entry.date,
        status: entry.status,
        description: entry.description,
        periodId: entry.periodId,
        periodCode: entry.period?.code ?? null,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        createdBy: entry.createdBy,
        approvedBy: entry.approvedBy,
        approvedAt: entry.approvedAt ? entry.approvedAt.toISOString() : null,
        postedBy: entry.postedBy,
        postedAt: entry.postedAt ? entry.postedAt.toISOString() : null,
        reversalOfEntryId: entry.reversalOfEntryId,
        reversedByEntryId: entry.reversedByEntryId,
      },
      lines: entry.lines.map((line) => ({
        lineNo: line.lineNo,
        accountCode: line.account?.code ?? '',
        accountName: line.account?.name ?? '',
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      })),
      sourceDocument: entry.reference,
      // Mục 10.0 — truy vết có cấu trúc: bút toán nhập tay thì không có chứng từ nguồn.
      source: entry.sourceId
        ? { type: entry.sourceType, id: entry.sourceId }
        : null,
      history,
    };
  }
}
