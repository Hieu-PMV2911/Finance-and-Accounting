import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  NotificationAudience,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
} from '../enums/notification.enum.js';

/**
 * Thông báo trong hệ thống (mục 9 — "gửi thông báo").
 *
 * Đây là **kênh nhận** của mọi job nền: nhắc công nợ, báo cáo sinh xong, cảnh
 * báo vi phạm bất biến. Thay vì gửi email/SMS (cần dịch vụ ngoài), thông báo
 * được lưu trong DB và hiển thị ngay trên giao diện — job nền ghi vào bảng này
 * nên không phụ thuộc dịch vụ thứ ba để chứng minh luồng bất đồng bộ chạy được.
 *
 * Phạm vi hiển thị:
 * - `all`      : mọi người dùng thấy.
 * - `admin`    : chỉ `admin` thấy (cảnh báo bất biến, sự cố hệ thống).
 * - `poster`   : `poster` **và** `admin` thấy (cảnh báo cần hành động ghi sổ).
 * - `targeted` : chỉ `targetUserId` thấy (báo cáo của chính người yêu cầu).
 *
 * ⚠️ `audience` là **enum của Postgres**. Thêm giá trị mới (như `poster` ở mục
 * 10.A) thì môi trường đang chạy `synchronize: false` phải tự chạy
 * `ALTER TYPE notification_audience_enum ADD VALUE 'poster';` trước khi deploy.
 */
@Entity('notifications')
@Index(['status', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type_enum',
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationSeverity,
    enumName: 'notification_severity_enum',
    default: NotificationSeverity.INFO,
  })
  severity: NotificationSeverity;

  @Index()
  @Column({
    type: 'enum',
    enum: NotificationStatus,
    enumName: 'notification_status_enum',
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  @Column({
    type: 'enum',
    enum: NotificationAudience,
    enumName: 'notification_audience_enum',
    default: NotificationAudience.ALL,
  })
  audience: NotificationAudience;

  /** Chỉ dùng khi `audience = targeted`. */
  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Dữ liệu kèm theo (job run id, kỳ kế toán, đường dẫn tải…) để FE bấm tới. */
  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ name: 'read_by', type: 'uuid', nullable: true })
  readBy: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
