import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WebhookEventStatus } from '../enums/webhook.enum.js';

/**
 * Webhook **nhận vào** — nền tảng xử lý kết quả đến trễ (mục 9, chuẩn bị cho
 * Payment & Reconciliation).
 *
 * Ba tình huống phải xử lý đúng:
 * 1. **Trùng lặp**: hệ thống ngoài gửi lại cùng một sự kiện (`externalId`) →
 *    ghi nhận `duplicate`, trả 200 để bên gửi ngừng retry, **không** áp dụng lại.
 * 2. **Đến trễ**: sự kiện tới sau khi một sự kiện **mới hơn** của cùng đối tượng
 *    (`resourceRef`) đã được xử lý → ghi nhận `late`, giữ lại để kiểm toán,
 *    **không** ghi đè trạng thái mới hơn.
 * 3. **Sai chữ ký**: từ chối (`rejected`).
 *
 * Bảng là append-only: mọi lần nhận đều được lưu, kể cả lần bị bỏ qua.
 */
@Entity('webhook_events')
@Index(['resourceRef', 'occurredAt'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Id sự kiện do hệ thống ngoài sinh — khóa idempotency. */
  @Index({ unique: true })
  @Column({ name: 'external_id', type: 'varchar', length: 200 })
  externalId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  /** Đối tượng nghiệp vụ mà sự kiện nói tới (mã hóa đơn, mã thanh toán…). */
  @Column({ name: 'resource_ref', type: 'varchar', length: 200 })
  resourceRef: string;

  /** Lúc sự kiện **xảy ra** ở hệ thống ngoài (khác `receivedAt` lúc nhận). */
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({
    type: 'enum',
    enum: WebhookEventStatus,
    enumName: 'webhook_event_status_enum',
    default: WebhookEventStatus.PROCESSED,
  })
  status: WebhookEventStatus;

  /** Lý do bị bỏ qua (trùng / đến trễ / sai chữ ký). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
