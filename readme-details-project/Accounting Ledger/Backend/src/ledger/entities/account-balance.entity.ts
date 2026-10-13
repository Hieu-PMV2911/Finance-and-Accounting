import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import { FiscalPeriod } from '../../fiscal-periods/entities/fiscal-period.entity.js';

/**
 * Số dư tài khoản theo kỳ kế toán.
 *
 * Mỗi cặp (tài khoản, kỳ) có đúng một dòng. Cấu trúc:
 *
 * ```
 * số dư đầu kỳ  = opening_debit / opening_credit
 * phát sinh kỳ  = debit_total   / credit_total
 * số dư cuối kỳ = đầu kỳ + phát sinh   (tính khi đọc, không lưu)
 * ```
 *
 * - `opening_*` được chốt khi **đóng kỳ trước** (`FiscalPeriodsService.close`).
 * - `debit_total`/`credit_total` chỉ cộng/trừ khi **ghi sổ** hoặc **đảo** bút toán,
 *   luôn nằm trong cùng transaction với bút toán và có khóa bi quan chống ghi đè.
 */
@Entity('account_balances')
@Index(['accountId', 'periodId'], { unique: true })
export class AccountBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @ManyToOne(() => FiscalPeriod, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: FiscalPeriod;

  @Column({
    name: 'opening_debit',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  openingDebit: string;

  @Column({
    name: 'opening_credit',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  openingCredit: string;

  @Column({
    name: 'debit_total',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  debitTotal: string;

  @Column({
    name: 'credit_total',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  creditTotal: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
