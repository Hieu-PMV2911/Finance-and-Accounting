import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { Allocation } from './entities/allocation.entity.js';

export interface AllocationTarget {
  total: string | number | Decimal;
  allocated: string | number | Decimal;
}

export interface AllocationSource {
  available: string | number | Decimal;
}

/**
 * Phân bổ thanh toán (mục 10.0/10.A) — lớp **phân tích công nợ**, không sinh bút toán.
 *
 * Vì sao tách khỏi bút toán: khi phiếu thu 50 triệu được ghi sổ, bút toán đã đúng ở mức
 * tổng (Nợ 111 / Có 131). Việc "50 triệu này trả cho hóa đơn nào" là **chiều phân tích**
 * thuần túy — nếu bắt bút toán phải biết, mỗi lần đổi cách phân bổ lại phải đảo bút toán.
 *
 * Mọi phương thức nhận `manager?` để chạy **trong transaction của nơi gọi** (cùng quy ước
 * với `FiscalPeriodsService.resolveByDate`). Bỏ qua tham số này sẽ ghi ngoài transaction —
 * chỉ làm vậy khi thao tác là một bước duy nhất, không cần khóa.
 */
@Injectable()
export class AllocationsService {
  constructor(
    @InjectRepository(Allocation)
    private readonly allocations: Repository<Allocation>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  remainingOfTarget(target: AllocationTarget): Decimal {
    const total = toMoney(target.total);
    const allocated = toMoney(target.allocated);
    if (allocated.greaterThan(total)) {
      return new Decimal(0);
    }
    return total.minus(allocated);
  }

  remainingOfSource(source: AllocationSource): Decimal {
    const available = toMoney(source.available);
    if (available.lessThan(0)) {
      return new Decimal(0);
    }
    return available;
  }

  canAllocate(
    target: AllocationTarget,
    source: AllocationSource,
    amount: string | number | Decimal,
  ): boolean {
    const amt = toMoney(amount);
    if (amt.lessThanOrEqualTo(0)) {
      return false;
    }
    if (amt.greaterThan(this.remainingOfTarget(target))) {
      return false;
    }
    if (amt.greaterThan(this.remainingOfSource(source))) {
      return false;
    }
    return true;
  }

  /**
   * **Đặt** số tiền phân bổ cho một cặp (nguồn, đích): chưa có thì tạo, đã có thì cập nhật.
   *
   * Vì sao "đặt" chứ không "cộng thêm": ràng buộc DB chỉ cho **một dòng mỗi cặp**, và
   * thao tác đặt là **idempotent** — client retry do timeout mạng không làm công nợ nhảy
   * gấp đôi. Thay vào đó, muốn tăng thì gửi số tiền tổng mới.
   *
   * Hàm này **không** tự kiểm trần hai bên: việc đó phải nằm trong transaction có khóa
   * chứng từ nguồn và đích — xem `PaymentAllocationsService.allocate`.
   */
  async setPairAmount(
    allocation: Omit<Allocation, 'id' | 'createdAt'>,
    manager?: EntityManager,
  ): Promise<Allocation> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    const amount = toMoney(allocation.amount);

    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Số tiền phân bổ phải lớn hơn 0');
    }

    const existing = await repo.findOne({
      where: {
        targetType: allocation.targetType,
        targetId: allocation.targetId,
        sourceType: allocation.sourceType,
        sourceId: allocation.sourceId,
      },
    });

    if (existing) {
      existing.amount = moneyToString(amount);
      return repo.save(existing);
    }

    return repo.save(repo.create({ ...allocation, amount: moneyToString(amount) }));
  }

  /** Số tiền đang phân bổ cho **một cặp** (nguồn, đích); chưa có ⇒ 0. */
  async amountOfPair(
    sourceType: Allocation['sourceType'],
    sourceId: string,
    targetType: Allocation['targetType'],
    targetId: string,
    manager?: EntityManager,
  ): Promise<Decimal> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    const row = await repo.findOne({
      where: { sourceType, sourceId, targetType, targetId },
    });
    return toMoney(row?.amount ?? '0');
  }

  /** Phân bổ theo **chứng từ đích** (dùng để tính số còn lại/dựng báo cáo tuổi nợ). */
  listByTarget(
    targetType: Allocation['targetType'],
    targetId: string,
    manager?: EntityManager,
  ): Promise<Allocation[]> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    return repo.find({ where: { targetType, targetId } });
  }

  /** Phân bổ theo **chứng từ nguồn** (dùng cho phiếu thu/chi). */
  listBySource(
    sourceType: Allocation['sourceType'],
    sourceId: string,
    manager?: EntityManager,
  ): Promise<Allocation[]> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    return repo.find({
      where: { sourceType, sourceId },
      order: { createdAt: 'ASC' },
    });
  }

  findById(id: string, manager?: EntityManager): Promise<Allocation | null> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    return repo.findOne({ where: { id } });
  }

  async unallocate(id: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    await repo.delete(id);
  }

  async allocatedToTarget(
    targetType: Allocation['targetType'],
    targetId: string,
    manager?: EntityManager,
  ): Promise<Decimal> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    const rows = await repo
      .createQueryBuilder('alloc')
      .select('COALESCE(SUM(alloc.amount), 0)', 'sum')
      .where('alloc.target_type = :targetType', { targetType })
      .andWhere('alloc.target_id = :targetId', { targetId })
      .getRawOne<{ sum: string }>();
    return toMoney(rows?.sum ?? '0');
  }

  async allocatedFromSource(
    sourceType: Allocation['sourceType'],
    sourceId: string,
    manager?: EntityManager,
  ): Promise<Decimal> {
    const repo = manager ? manager.getRepository(Allocation) : this.allocations;
    const rows = await repo
      .createQueryBuilder('alloc')
      .select('COALESCE(SUM(alloc.amount), 0)', 'sum')
      .where('alloc.source_type = :sourceType', { sourceType })
      .andWhere('alloc.source_id = :sourceId', { sourceId })
      .getRawOne<{ sum: string }>();
    return toMoney(rows?.sum ?? '0');
  }
}
