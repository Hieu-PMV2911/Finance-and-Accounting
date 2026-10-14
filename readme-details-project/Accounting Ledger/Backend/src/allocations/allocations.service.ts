import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { Allocation } from './entities/allocation.entity.js';

export interface AllocationTarget {
  total: string | number | Decimal;
  allocated: string | number | Decimal;
}

export interface AllocationSource {
  available: string | number | Decimal;
}

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

  async allocate(
    allocation: Omit<Allocation, 'id' | 'createdAt'>,
  ): Promise<Allocation> {
    const amt = toMoney(allocation.amount);
    if (amt.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Số tiền phân bổ phải lớn hơn 0');
    }

    const exists = await this.allocations.findOne({
      where: {
        targetType: allocation.targetType,
        targetId: allocation.targetId,
        sourceType: allocation.sourceType,
        sourceId: allocation.sourceId,
      },
    });
    if (exists) {
      throw new ConflictException('Đã tồn tại phân bổ cho cặp chứng từ này');
    }

    const entity = this.allocations.create({
      ...allocation,
      amount: moneyToString(amt),
    });
    return this.allocations.save(entity);
  }

  async unallocate(id: string): Promise<void> {
    await this.allocations.delete(id);
  }

  async allocatedToTarget(
    targetType: Allocation['targetType'],
    targetId: string,
  ): Promise<Decimal> {
    const rows = await this.allocations
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
  ): Promise<Decimal> {
    const rows = await this.allocations
      .createQueryBuilder('alloc')
      .select('COALESCE(SUM(alloc.amount), 0)', 'sum')
      .where('alloc.source_type = :sourceType', { sourceType })
      .andWhere('alloc.source_id = :sourceId', { sourceId })
      .getRawOne<{ sum: string }>();
    return toMoney(rows?.sum ?? '0');
  }
}
