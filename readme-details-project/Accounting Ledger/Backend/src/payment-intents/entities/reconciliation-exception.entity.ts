import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '../enums/reconciliation-exception.enum.js';

/**
 * Ngoại lệ đối soát (mục 10.B).
 *
 * Bảng này là **hàng đợi việc cho con người**: mỗi dòng là một chỗ hai nguồn sự
 * thật không khớp nhau mà hệ thống từ chối tự quyết. Nhờ vậy không có chỗ nào
 * trong code phải "đoán" kết quả giao dịch.
 *
 * `detail` giữ nguyên bằng chứng (payload provider, số tiền hai bên, id bản ghi
 * liên quan) — đủ để điều tra mà không phải gọi lại hệ thống ngoài.
 */
@Entity('reconciliation_exceptions')
export class ReconciliationException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
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

  /** Intent liên quan (nếu có) — dùng để mở thẳng giao dịch gốc. */
  @Index()
  @Column({ name: 'payment_intent_id', type: 'uuid', nullable: true })
  paymentIntentId: string | null;

  /** Mã tham chiếu phía hệ thống ngoài (event id, mã giao dịch ngân hàng…). */
  @Column({ name: 'external_ref', type: 'varchar', length: 255, nullable: true })
  externalRef: string | null;

  /** Bằng chứng: số tiền hai bên, payload provider, trạng thái trước/sau… */
  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_note', type: 'varchar', length: 500, nullable: true })
  resolutionNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
