import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AuditAction } from '../enums/audit-action.enum.js';

/**
 * Vết kiểm toán (audit log) — mục 8.
 *
 * Ghi lại **mọi thay đổi dữ liệu** kèm: ai làm (`actorId`/`actorEmail`), làm gì
 * (`action`), trên bản ghi nào (`entity`/`entityId`), **trước và sau** ra sao
 * (`before`/`after`), qua request nào (`method`/`path`/`ip`) và **lúc nào**
 * (`createdAt`).
 *
 * Bảng này là **append-only**: chỉ ghi thêm, không sửa, không xóa — nếu sửa được
 * thì vết kiểm toán mất giá trị.
 *
 * `before`/`after` chỉ chứa **trường vô hướng** (chuỗi/số/boolean/ngày) của
 * entity, không chứa quan hệ — vừa tránh tham chiếu vòng khi serialize, vừa giữ
 * payload nhỏ. Các trường nhạy cảm (mật khẩu, token) bị loại bỏ hoàn toàn.
 */
@Entity('audit_logs')
@Index(['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_email', type: 'varchar', length: 255, nullable: true })
  actorEmail: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: AuditAction,
    enumName: 'audit_action_enum',
  })
  action: AuditAction;

  /** Tên bảng dữ liệu bị thay đổi (vd `journal_entries`). */
  @Column({ type: 'varchar', length: 64 })
  entity: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 64, nullable: true })
  entityId: string | null;

  /** Ảnh chụp trước khi thay đổi (`null` với thao tác tạo mới). */
  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  /** Ảnh chụp sau khi thay đổi (`null` với thao tác xóa). */
  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  path: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
