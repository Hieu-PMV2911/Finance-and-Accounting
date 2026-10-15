import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  ReconciliationMatchedBy,
  ReconciliationMatchTier,
  ReconciliationTargetType,
} from '../../common/enums/reconciliation-target-type.enum.js';

/**
 * Một **dòng khớp** giữa sao kê và chứng từ nội bộ (mục 10.B).
 *
 * Cho phép quan hệ **n-n** đúng như thực tế:
 * - một khoản thu gộp trên sao kê khớp **nhiều** hóa đơn,
 * - một khoản nội bộ bị ngân hàng tách thành **nhiều** dòng (phí, chuyển từng phần).
 *
 * Vì vậy `amount` được lưu **trên từng dòng khớp** chứ không suy ra từ chứng từ —
 * nếu không, không thể biểu diễn "khớp một phần". Bảng chỉ là **lớp phân tích đối
 * soát**: nó không sinh bút toán, bút toán đã đúng ở mức tổng.
 */
@Entity('reconciliation_matches')
@Index('reconciliation_matches_line_idx', ['statementLineId'])
@Index('reconciliation_matches_target_idx', ['targetType', 'targetId'])
@Index('reconciliation_matches_pair_unique', ['statementLineId', 'targetType', 'targetId'], {
  unique: true,
})
export class ReconciliationMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Dòng sao kê (`bank_transactions.id`). */
  @Column({ name: 'statement_line_id', type: 'uuid' })
  statementLineId: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ReconciliationTargetType,
    enumName: 'reconciliation_target_type_enum',
  })
  targetType: ReconciliationTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  /** Số tiền được khớp **của riêng dòng này** (hỗ trợ khớp một phần / gộp). */
  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  /** Tầng khớp đã tìm ra (chỉ có ý nghĩa với `matchedBy = auto`). */
  @Column({
    name: 'match_tier',
    type: 'enum',
    enum: ReconciliationMatchTier,
    enumName: 'reconciliation_match_tier_enum',
    nullable: true,
  })
  matchTier: ReconciliationMatchTier | null;

  @Column({
    name: 'matched_by',
    type: 'enum',
    enum: ReconciliationMatchedBy,
    enumName: 'reconciliation_matched_by_enum',
    default: ReconciliationMatchedBy.AUTO,
  })
  matchedBy: ReconciliationMatchedBy;

  @Column({ name: 'matched_by_user_id', type: 'uuid', nullable: true })
  matchedByUserId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'matched_at', type: 'timestamptz' })
  matchedAt: Date;
}
