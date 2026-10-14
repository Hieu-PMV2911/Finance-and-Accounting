import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WebhookEventType } from '../enums/webhook.enum.js';

/**
 * Endpoint nhận webhook của hệ thống ngoài (mục 9).
 *
 * `secret` dùng để ký HMAC-SHA256 payload (`X-Webhook-Signature`) — bên nhận
 * xác minh chữ ký để chắc chắn webhook đến từ hệ thống này.
 *
 * `events` là danh sách sự kiện endpoint đăng ký; để trống = nhận **mọi** sự
 * kiện. Lưu dạng `text` phân tách bằng dấu phẩy (đủ dùng, không cần bảng phụ).
 */
@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  /** Khóa ký HMAC. Không bao giờ trả ra ngoài qua API. */
  @Column({ type: 'varchar', length: 200 })
  secret: string;

  /** Danh sách sự kiện đăng ký (`''` = mọi sự kiện). */
  @Column({ type: 'text', name: 'events', default: '' })
  events: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Các sự kiện đã đăng ký dưới dạng mảng (`[]` = mọi sự kiện). */
  subscriptionList(): WebhookEventType[] {
    if (!this.events) return [];
    return this.events
      .split(',')
      .map((item) => item.trim())
      .filter((item): item is WebhookEventType =>
        Object.values(WebhookEventType).includes(item as WebhookEventType),
      );
  }

  /** Endpoint có nhận sự kiện này không. */
  subscribesTo(eventType: WebhookEventType): boolean {
    const list = this.subscriptionList();
    return list.length === 0 || list.includes(eventType);
  }
}
