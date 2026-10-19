import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  ReconciliationMatchTargetType,
  ReconciliationMatchTier,
} from '../enums/bank-transaction.enum.js';
import { BankTransaction } from './bank-transaction.entity.js';

/**
 * Một dòng khớp giữa dòng sao kê và chứng từ nội bộ (mục 10.B — P2.3).
 *
 * Cho phép **n-n**: một dòng sao lớn có thể phủ nhiều chứng từ nhỏ và ngược
 * lại, nên luôn lưu `amount` từng dòng — không suy số tiền ra từ "dòng gốc".
 * Mục tiêu là số tiền **thật sự được khớp**, không phải số tiền của bên nào.
 *
 * `matchedBy = manual` là người xác nhận; còn lại là hệ thống khớp tầng 1/2.
 */
@Entity('reconciliation_matches')
@Index(['transactionId', 'targetType', 'targetId'], { unique: true })
export class ReconciliationMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => BankTransaction, (transaction) => transaction.match, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction: BankTransaction;

  /** Loại chứng từ đối chiếu (phiếu thu/chi, bút toán…). */
  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ReconciliationMatchTargetType,
    enumName: 'reconciliation_match_target_type_enum',
  })
  targetType: ReconciliationMatchTargetType;

  @Index()
  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  /** Số tiền được khớp ở dòng này (có thể nhỏ hơn số tiền dòng sao). */
  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  @Column({
    name: 'matched_by_tier',
    type: 'enum',
    enum: ReconciliationMatchTier,
    enumName: 'reconciliation_match_tier_enum',
  })
  matchedByTier: ReconciliationMatchTier;

  /** Người xác nhận (bắt buộc khi `matchedByTier = manual`). */
  @Column({ name: 'matched_by', type: 'uuid', nullable: true })
  matchedBy: string | null;

  @Column({ name: 'matched_at', type: 'timestamptz' })
  matchedAt: Date;

  @Column({ name: 'note', type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
