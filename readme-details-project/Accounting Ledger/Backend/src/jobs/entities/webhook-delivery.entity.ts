import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WebhookDeliveryStatus, WebhookEventType } from '../enums/webhook.enum.js';

/**
 * Nhật ký giao webhook **ra ngoài** (mục 9).
 *
 * Mỗi lần job `deliver-webhook` chạy là một dòng: gọi HTTP POST tới
 * `endpoint.url`, ghi lại mã trạng thái và body trả về, số lần đã thử và thời
 * điểm thử kế tiếp. Nhờ vậy retry có **trạng thái bền** (không mất khi restart)
 * và người vận hành nhìn thấy được cái gì đang kẹt.
 *
 * `idempotencyKey` duy nhất để chống giao trùng một sự kiện.
 */
@Entity('webhook_deliveries')
@Index(['status', 'createdAt'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: WebhookEventType,
    enumName: 'webhook_event_type_enum',
  })
  eventType: WebhookEventType;

  /** Khóa chống giao trùng: `<eventType>:<entityId>:<mốc nghiệp vụ>`. */
  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: WebhookDeliveryStatus,
    enumName: 'webhook_delivery_status_enum',
    default: WebhookDeliveryStatus.PENDING,
  })
  status: WebhookDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts: number;

  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  /** Thời điểm được phép thử lại (dùng cho backoff). */
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
