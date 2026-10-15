import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '../../common/enums/reconciliation-exception.enum.js';
import { ReconciliationTargetType } from '../../common/enums/reconciliation-target-type.enum.js';

/**
 * **Giao dịch lệch** phát hiện khi đối soát (mục 10.B).
 *
 * Nguyên tắc: khi hai bên không khớp được, hệ thống **không im lặng bỏ qua** và
 * cũng **không tự đoán** — nó ghi lại một dòng lệch có phân loại, để con người
 * quyết định. Mọi hành động xử lý đều vào audit log (subscriber tự ghi).
 *
 * Đây cũng là nơi hứng "kết quả thanh toán đến trễ mâu thuẫn": webhook tới sau khi
 * intent đã chốt ở trạng thái khác ⇒ **không ghi đè**, sinh dòng
 * `late_event_conflict` để người xử lý.
 */
@Entity('reconciliation_exceptions')
@Index('reconciliation_exceptions_status_idx', ['status'])
@Index('reconciliation_exceptions_type_idx', ['type'])
@Index('reconciliation_exceptions_line_idx', ['statementLineId'])
export class ReconciliationException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ReconciliationExceptionType,
    enumName: 'reconciliation_exception_type_enum',
  })
  type: ReconciliationExceptionType;

  @Index()
  @Column({
    type: 'enum',
    enum: ReconciliationExceptionStatus,
    enumName: 'reconciliation_exception_status_enum',
    default: ReconciliationExceptionStatus.OPEN,
  })
  status: ReconciliationExceptionStatus;

  /** Bảng sao kê liên quan (nếu lệch phát sinh từ sao kê). */
  @Column({ name: 'statement_id', type: 'uuid', nullable: true })
  statementId: string | null;

  /** Dòng sao kê liên quan. */
  @Column({ name: 'statement_line_id', type: 'uuid', nullable: true })
  statementLineId: string | null;

  /** Chứng từ nội bộ liên quan (nếu có). */
  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ReconciliationTargetType,
    enumName: 'reconciliation_target_type_enum',
    nullable: true,
  })
  targetType: ReconciliationTargetType | null;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  /** Số tiền liên quan (nếu xác định được). */
  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true })
  amount: string | null;

  /** Mô tả chi tiết — đủ để người đối soát hiểu mà không cần đọc lại dữ liệu gốc. */
  @Column({ type: 'text' })
  detail: string;

  /** Khóa chống sinh trùng cùng một lệch qua nhiều lần chạy khớp. */
  @Index({ unique: true })
  @Column({ name: 'dedupe_key', type: 'varchar', length: 300 })
  dedupeKey: string;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
