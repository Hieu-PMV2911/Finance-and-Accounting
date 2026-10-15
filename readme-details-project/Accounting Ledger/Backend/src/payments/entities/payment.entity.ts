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

import { PaymentDirection } from '../../common/enums/payment-direction.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';
import { Party } from '../../parties/entities/party.entity.js';

/**
 * Phiếu thu / phiếu chi (mục 10.A).
 *
 * Vai trò trong sổ cái: phiếu **không tự viết** Nợ/Có — khi ghi sổ nó gọi
 * `JournalsService` trong cùng transaction, `source_type = payment` và
 * `source_id = payments.id`. Nhờ vậy bút toán sinh ra có truy vết ngược về phiếu,
 * và ràng buộc "một chứng từ nguồn ⇒ một bút toán gốc" vẫn giữ.
 *
 * Phiếu chỉ **là lớp phân tích công nợ** khi kết hợp `allocations`: bút toán đã đúng ở
 * mức tổng (Nợ 111 / Có 131), còn "phiếu này trả cho hóa đơn nào" nằm ở `allocations`.
 *
 * Bất biến:
 * - `code` duy nhất; `idempotencyKey` duy nhất khi có.
 * - Đã ghi sổ ⇒ bất biến: sửa/hủy bằng chứng từ đảo, không sửa bút toán.
 * - Chỉ phiếu `posted` mới được phân bổ.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Index()
  @Column({
    type: 'enum',
    enum: PaymentDirection,
    enumName: 'payment_direction_enum',
  })
  direction: PaymentDirection;

  @Index()
  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @ManyToOne(() => Party, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  currency: string | null;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method_enum' })
  method: PaymentMethod;

  /** Số phiếu / số ủy nhiệm chi của ngân hàng (nếu có). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /**
   * Tài khoản tiền (111/112) dùng để ghi sổ. Bỏ trống ⇒ suy ra theo `method`
   * (`cash` → 111*, `bank_transfer` → 112*); `other` **bắt buộc** khai.
   */
  @Column({ name: 'cash_account_id', type: 'uuid', nullable: true })
  cashAccountId: string | null;

  @Index({ unique: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  idempotencyKey: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.DRAFT,
  })
  status: PaymentStatus;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  /** Bút toán **đảo** khi hủy phiếu đã ghi sổ; bản gốc không bao giờ bị sửa. */
  @Column({ name: 'reversal_journal_entry_id', type: 'uuid', nullable: true })
  reversalJournalEntryId: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'void_reason', type: 'varchar', length: 500, nullable: true })
  voidReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
