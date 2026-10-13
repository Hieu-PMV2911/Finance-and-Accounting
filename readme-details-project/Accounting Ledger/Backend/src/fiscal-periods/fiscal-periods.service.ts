import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';

import {
  acceptsPostings,
  FISCAL_PERIOD_STATUS_LABELS,
  FiscalPeriodStatus,
} from '../common/enums/fiscal-period-status.enum.js';
import { compareIsoDates, isIsoDate } from '../common/utils/date.util.js';
import { JournalEntry } from '../journals/entities/journal-entry.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { AccountBalanceView } from '../ledger/interfaces/account-balance-view.interface.js';
import type { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto.js';
import type { QueryFiscalPeriodsDto } from './dto/query-fiscal-periods.dto.js';
import type { UpdateFiscalPeriodDto } from './dto/update-fiscal-period.dto.js';
import { FiscalPeriod } from './entities/fiscal-period.entity.js';

/**
 * Kỳ kế toán (mục 4).
 *
 * Chịu trách nhiệm:
 * - Vòng đời kỳ: tạo → (khóa/mở) → chốt.
 * - Chặn mọi bút toán vào kỳ không mở (bất biến số 3).
 * - Khi **chốt kỳ**, chuyển số dư cuối kỳ thành số dư đầu kỳ của kỳ kế tiếp.
 *
 * `LOCKED` và `CLOSED` đều đóng băng kỳ; khác biệt duy nhất là `LOCKED` mở lại
 * được còn `CLOSED` thì không (và `CLOSED` đã kết chuyển số dư sang kỳ sau).
 */
@Injectable()
export class FiscalPeriodsService {
  constructor(
    @InjectRepository(FiscalPeriod)
    private readonly periods: Repository<FiscalPeriod>,
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
    private readonly ledger: LedgerService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------- truy vấn

  async list(query: QueryFiscalPeriodsDto = {}): Promise<FiscalPeriod[]> {
    const qb = this.periods
      .createQueryBuilder('period')
      .orderBy('period.startDate', 'ASC');

    if (query.status) {
      qb.andWhere('period.status = :status', { status: query.status });
    }
    if (query.year !== undefined) {
      const from = `${query.year}-01-01`;
      const to = `${query.year}-12-31`;
      qb.andWhere('period.startDate <= :to AND period.endDate >= :from', {
        from,
        to,
      });
    }
    if (query.date) {
      qb.andWhere('period.startDate <= :date AND period.endDate >= :date', {
        date: query.date,
      });
    }
    if (query.search) {
      qb.andWhere('(period.code ILIKE :s OR period.name ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<FiscalPeriod> {
    const period = await this.periods.findOne({ where: { id } });
    if (!period) {
      throw new NotFoundException('Không tìm thấy kỳ kế toán');
    }
    return period;
  }

  /** Số dư từng tài khoản trong kỳ (phục vụ rà soát trước khi chốt kỳ). */
  async balances(id: string): Promise<AccountBalanceView[]> {
    await this.findById(id);
    return this.ledger.listByPeriod(id);
  }

  /**
   * Tìm kỳ kế toán chứa một ngày.
   * Dùng bởi module Journals để gắn bút toán vào đúng kỳ.
   */
  async resolveByDate(
    date: string,
    manager?: EntityManager,
    lock = false,
  ): Promise<FiscalPeriod> {
    const repo = manager ? manager.getRepository(FiscalPeriod) : this.periods;

    const period = await repo.findOne({
      where: {
        startDate: LessThanOrEqual(date),
        endDate: MoreThanOrEqual(date),
      },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });

    if (!period) {
      throw new BadRequestException(
        `Ngày ${date} không thuộc kỳ kế toán nào — hãy tạo kỳ kế toán trước`,
      );
    }
    return period;
  }

  /**
   * Bất biến số 3: chỉ kỳ đang **mở** mới nhận bút toán.
   *
   * Áp dụng cho **mọi** thao tác ghi (tạo nháp, sửa, xóa, ghi sổ, đảo) — kỳ đã
   * khóa hoặc đã chốt thì đóng băng hoàn toàn, kể cả bút toán nháp.
   */
  assertAcceptsPostings(period: FiscalPeriod): void {
    if (!acceptsPostings(period.status)) {
      throw new BadRequestException(
        `Kỳ ${period.code} đang ở trạng thái "${FISCAL_PERIOD_STATUS_LABELS[period.status]}" — chỉ kỳ đang mở mới được ghi bút toán`,
      );
    }
  }

  // ------------------------------------------------------------ vòng đời

  async create(
    dto: CreateFiscalPeriodDto,
    actorId: string,
  ): Promise<FiscalPeriod> {
    const code = dto.code.trim();
    this.assertValidRange(dto.startDate, dto.endDate);

    const duplicated = await this.periods.findOne({ where: { code } });
    if (duplicated) {
      throw new ConflictException(`Mã kỳ "${code}" đã tồn tại`);
    }
    await this.assertNoOverlap(dto.startDate, dto.endDate);

    const period = this.periods.create({
      code,
      name: dto.name.trim(),
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: FiscalPeriodStatus.OPEN,
      notes: dto.notes?.trim() ?? null,
      createdBy: actorId,
    });

    return this.periods.save(period);
  }

  async update(id: string, dto: UpdateFiscalPeriodDto): Promise<FiscalPeriod> {
    const period = await this.findById(id);
    if (period.status !== FiscalPeriodStatus.OPEN) {
      throw new BadRequestException(
        `Chỉ sửa được kỳ đang mở (kỳ ${period.code} đang ở trạng thái "${period.status}")`,
      );
    }

    const startDate = dto.startDate ?? period.startDate;
    const endDate = dto.endDate ?? period.endDate;
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      this.assertValidRange(startDate, endDate);
      await this.assertNoOverlap(startDate, endDate, id);
    }

    if (dto.name !== undefined) {
      period.name = dto.name.trim();
    }
    if (dto.notes !== undefined) {
      period.notes = dto.notes?.trim() || null;
    }
    period.startDate = startDate;
    period.endDate = endDate;

    return this.periods.save(period);
  }

  async remove(id: string): Promise<void> {
    const period = await this.findById(id);
    if (period.status !== FiscalPeriodStatus.OPEN) {
      throw new BadRequestException(
        `Chỉ xóa được kỳ đang mở (kỳ ${period.code} đang ở trạng thái "${period.status}")`,
      );
    }

    const entryCount = await this.entries.count({ where: { periodId: id } });
    if (entryCount > 0) {
      throw new ConflictException(
        `Kỳ ${period.code} đã có ${entryCount} bút toán — không thể xóa`,
      );
    }

    await this.periods.remove(period);
  }

  /** Mở lại kỳ đã tạm khóa. Kỳ đã chốt thì không thể mở lại. */
  async open(id: string): Promise<FiscalPeriod> {
    return this.transition(id, FiscalPeriodStatus.OPEN, (period) => {
      if (period.status === FiscalPeriodStatus.CLOSED) {
        throw new BadRequestException(
          `Kỳ ${period.code} đã chốt — không thể mở lại`,
        );
      }
      if (period.status === FiscalPeriodStatus.OPEN) {
        throw new BadRequestException(`Kỳ ${period.code} đang mở`);
      }
      period.lockedAt = null;
      period.lockedBy = null;
    });
  }

  /** Tạm khóa kỳ: chặn ghi sổ nhưng vẫn có thể mở lại. */
  async lock(id: string, actorId: string): Promise<FiscalPeriod> {
    return this.transition(id, FiscalPeriodStatus.LOCKED, (period) => {
      if (period.status === FiscalPeriodStatus.CLOSED) {
        throw new BadRequestException(`Kỳ ${period.code} đã chốt`);
      }
      if (period.status === FiscalPeriodStatus.LOCKED) {
        throw new BadRequestException(`Kỳ ${period.code} đã được khóa`);
      }
      period.lockedAt = new Date();
      period.lockedBy = actorId;
    });
  }

  /**
   * Chốt kỳ (không thể hoàn tác).
   *
   * Trong cùng một transaction: đánh dấu kỳ đã chốt, rồi chuyển số dư cuối kỳ
   * thành số dư đầu kỳ của kỳ kế tiếp (nếu có).
   */
  async close(id: string, actorId: string): Promise<FiscalPeriod> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(FiscalPeriod);
      const period = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!period) {
        throw new NotFoundException('Không tìm thấy kỳ kế toán');
      }
      if (period.status === FiscalPeriodStatus.CLOSED) {
        throw new BadRequestException(`Kỳ ${period.code} đã được chốt`);
      }

      period.status = FiscalPeriodStatus.CLOSED;
      period.closedAt = new Date();
      period.closedBy = actorId;
      const saved = await repo.save(period);

      // Kỳ kế tiếp = kỳ có ngày bắt đầu sớm nhất sau ngày kết thúc kỳ này.
      const next = await repo.findOne({
        where: { startDate: MoreThan(period.endDate) },
        order: { startDate: 'ASC' },
      });
      if (next) {
        await this.ledger.carryForwardOpening(manager, period.id, next.id);
      }

      return saved;
    });
  }

  // ---------------------------------------------------------------- helpers

  private async transition(
    id: string,
    status: FiscalPeriodStatus,
    mutate: (period: FiscalPeriod) => void,
  ): Promise<FiscalPeriod> {
    const period = await this.findById(id);
    mutate(period);
    period.status = status;
    return this.periods.save(period);
  }

  private assertValidRange(startDate: string, endDate: string): void {
    if (!isIsoDate(startDate)) {
      throw new BadRequestException('startDate không phải ngày hợp lệ');
    }
    if (!isIsoDate(endDate)) {
      throw new BadRequestException('endDate không phải ngày hợp lệ');
    }
    if (compareIsoDates(startDate, endDate) > 0) {
      throw new BadRequestException(
        'Ngày bắt đầu kỳ phải nhỏ hơn hoặc bằng ngày kết thúc',
      );
    }
  }

  /** Hai kỳ chồng lấn khi `start <= other.end` và `end >= other.start`. */
  private async assertNoOverlap(
    startDate: string,
    endDate: string,
    exceptId?: string,
  ): Promise<void> {
    const overlapping = await this.periods.findOne({
      where: {
        startDate: LessThanOrEqual(endDate),
        endDate: MoreThanOrEqual(startDate),
        ...(exceptId ? { id: Not(exceptId) } : {}),
      },
    });

    if (overlapping) {
      throw new ConflictException(
        `Khoảng ngày ${startDate} → ${endDate} chồng lấn với kỳ "${overlapping.code}" (${overlapping.startDate} → ${overlapping.endDate})`,
      );
    }
  }
}
