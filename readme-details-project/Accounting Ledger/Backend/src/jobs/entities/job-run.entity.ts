import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  JobQueue,
  JobRunStatus,
  JobTrigger,
} from '../enums/job.enum.js';

/**
 * Lịch sử chạy job (mục 9).
 *
 * Một dòng cho **mỗi lượt chạy** — dù do cron, do API hay do job khác sinh ra.
 * Bảng này là nguồn dữ liệu cho màn hình "Xử lý bất đồng bộ": xem hàng đợi,
 * xem lượt chạy nào lỗi, và thử lại.
 *
 * Liên kết với BullMQ: `id` của dòng này **chính là** `jobId` đặt vào BullMQ,
 * nên worker chỉ cần `job.id` là cập nhật được đúng dòng (không cần bảng ánh xạ).
 */
@Entity('job_runs')
@Index(['queue', 'status'])
export class JobRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'enum', enum: JobQueue, enumName: 'job_queue_enum' })
  queue: JobQueue;

  @Column({ name: 'job_name', type: 'varchar', length: 64 })
  jobName: string;

  @Index()
  @Column({
    type: 'enum',
    enum: JobRunStatus,
    enumName: 'job_run_status_enum',
    default: JobRunStatus.PENDING,
  })
  status: JobRunStatus;

  @Column({
    type: 'enum',
    enum: JobTrigger,
    enumName: 'job_trigger_enum',
    default: JobTrigger.SYSTEM,
  })
  trigger: JobTrigger;

  /** Người kích hoạt (chỉ có khi `trigger = api`). */
  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy: string | null;

  @Column({
    name: 'triggered_by_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  triggeredByEmail: string | null;

  /** Tham số đầu vào của job (đủ để chạy lại khi bấm "Thử lại"). */
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** Kết quả job (vd số dư đã chốt, danh sách vi phạm, tên file đã sinh). */
  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  /** Thông điệp lỗi của lần thử cuối. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  maxAttempts: number;

  /** Tiến độ 0–100 (job dài có thể cập nhật dần). */
  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
