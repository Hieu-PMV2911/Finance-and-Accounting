import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AllocationSourceType } from '../../common/enums/allocation-source-type.enum.js';
import { AllocationTargetType } from '../../common/enums/allocation-target-type.enum.js';

@Entity('allocations')
@Index('allocations_target_idx', ['targetType', 'targetId'])
@Index('allocations_source_idx', ['sourceType', 'sourceId'])
@Index('allocations_unique', ['targetType', 'targetId', 'sourceType', 'sourceId'], {
  unique: true,
})
export class Allocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: AllocationTargetType,
    enumName: 'allocation_target_type_enum',
  })
  targetType: AllocationTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: AllocationSourceType,
    enumName: 'allocation_source_type_enum',
  })
  sourceType: AllocationSourceType;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({
    type: 'numeric',
    precision: 19,
    scale: 4,
  })
  amount: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
