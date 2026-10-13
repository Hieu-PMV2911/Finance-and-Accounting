import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { FiscalPeriodStatus } from '../../common/enums/fiscal-period-status.enum.js';

/**
 * Kỳ kế toán (fiscal period).
 *
 * Bất biến:
 * - `code` duy nhất.
 * - `startDate <= endDate`.
 * - Các kỳ **không chồng lấn** nhau (một ngày chỉ thuộc tối đa một kỳ).
 * - Chỉ kỳ `open` mới nhận bút toán ghi sổ.
 * - Kỳ `closed` không thể mở lại.
 */
@Entity('fiscal_periods')
export class FiscalPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mã kỳ (vd: `2026-01`, `2026-Q1`, `2026`). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Ngày bắt đầu (bao gồm) — kiểu `date`, không có giờ. */
  @Index()
  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  /** Ngày kết thúc (bao gồm). */
  @Index()
  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Index()
  @Column({
    type: 'enum',
    enum: FiscalPeriodStatus,
    enumName: 'fiscal_period_status_enum',
    default: FiscalPeriodStatus.OPEN,
  })
  status: FiscalPeriodStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'locked_by', type: 'uuid', nullable: true })
  lockedBy: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
