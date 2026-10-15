import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import type { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import { Notification } from './entities/notification.entity.js';
import {
  NotificationAudience,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
} from './enums/notification.enum.js';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  audience?: NotificationAudience;
  /** Bắt buộc khi `audience = targeted`. */
  targetUserId?: string | null;
  data?: Record<string, unknown> | null;
}

/**
 * Thông báo trong hệ thống (mục 9 — "gửi thông báo").
 *
 * Job nền **ghi** vào bảng này (không cần bên thứ ba), giao diện **đọc** và
 * đánh dấu đã đọc. Phạm vi hiển thị được lọc theo vai trò và theo người nhận:
 *
 * - `all`      : ai cũng thấy.
 * - `admin`    : chỉ `admin` thấy (cảnh báo bất biến, sự cố hệ thống).
 * - `poster`   : `poster` và `admin` thấy (cảnh báo cần hành động ghi sổ).
 * - `targeted` : chỉ `targetUserId` thấy (vd báo cáo của chính người yêu cầu).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = this.notifications.create({
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body,
      severity: input.severity ?? NotificationSeverity.INFO,
      audience: input.audience ?? NotificationAudience.ALL,
      targetUserId: input.targetUserId ?? null,
      data: input.data ?? null,
      status: NotificationStatus.UNREAD,
      readAt: null,
      readBy: null,
    });

    return this.notifications.save(notification);
  }

  async list(
    query: QueryNotificationsDto,
    user: AuthUser,
  ): Promise<Notification[]> {
    const qb = this.notifications
      .createQueryBuilder('n')
      .orderBy('n.createdAt', 'DESC')
      .take(query.limit ?? 50)
      .skip(query.offset ?? 0);

    this.applyVisibility(qb, user);

    if (query.type) qb.andWhere('n.type = :type', { type: query.type });
    if (query.status) qb.andWhere('n.status = :status', { status: query.status });
    if (query.severity) {
      qb.andWhere('n.severity = :severity', { severity: query.severity });
    }
    if (query.search) {
      qb.andWhere('(n.title ILIKE :s OR n.body ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    return qb.getMany();
  }

  /** Số thông báo chưa đọc mà người dùng này nhìn thấy — dùng cho badge. */
  async unreadCount(user: AuthUser): Promise<number> {
    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n.status = :status', { status: NotificationStatus.UNREAD });

    this.applyVisibility(qb, user);

    return qb.getCount();
  }

  async markRead(id: string, user: AuthUser): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    if (!this.isVisible(notification, user)) {
      throw new ForbiddenException('Bạn không có quyền với thông báo này');
    }
    if (notification.status === NotificationStatus.READ) {
      return notification;
    }

    notification.status = NotificationStatus.READ;
    notification.readAt = new Date();
    notification.readBy = user.id;
    return this.notifications.save(notification);
  }

  /** Đánh dấu đã đọc mọi thông báo người dùng nhìn thấy. Trả về số dòng đổi. */
  async markAllRead(user: AuthUser): Promise<number> {
    const unread = await this.notifications
      .createQueryBuilder('n')
      .where('n.status = :status', { status: NotificationStatus.UNREAD })
      .andWhere(this.visibilityClause(user).sql, this.visibilityClause(user).params)
      .getMany();

    if (unread.length === 0) return 0;

    await this.notifications.update(
      unread.map((item) => item.id),
      { status: NotificationStatus.READ, readAt: new Date(), readBy: user.id },
    );
    return unread.length;
  }

  // -------------------------------------------------------------- phạm vi

  private applyVisibility(
    qb: ReturnType<Repository<Notification>['createQueryBuilder']>,
    user: AuthUser,
  ): void {
    const { sql, params } = this.visibilityClause(user);
    qb.andWhere(sql, params);
  }

  /**
   * Điều kiện phạm vi hiển thị:
   * gửi đích danh cho tôi, **hoặc** gửi chung, **hoặc** gửi cho nhóm tôi thuộc
   * (quản trị / người ghi sổ).
   */
  private visibilityClause(user: AuthUser): {
    sql: string;
    params: Record<string, unknown>;
  } {
    const isAdmin = user.roles.includes(Role.ADMIN);
    return {
      sql: `(n.targetUserId = :viewerId
             OR (n.targetUserId IS NULL
                 AND (n.audience = :audienceAll
                      OR (n.audience = :audienceAdmin AND :isAdmin = true)
                      OR (n.audience = :audiencePoster AND :canPost = true))))`,
      params: {
        viewerId: user.id,
        audienceAll: NotificationAudience.ALL,
        audienceAdmin: NotificationAudience.ADMIN,
        audiencePoster: NotificationAudience.POSTER,
        isAdmin,
        canPost: isAdmin || user.roles.includes(Role.POSTER),
      },
    };
  }

  private isVisible(notification: Notification, user: AuthUser): boolean {
    if (notification.targetUserId) return notification.targetUserId === user.id;
    if (notification.audience === NotificationAudience.ADMIN) {
      return user.roles.includes(Role.ADMIN);
    }
    if (notification.audience === NotificationAudience.POSTER) {
      return (
        user.roles.includes(Role.ADMIN) || user.roles.includes(Role.POSTER)
      );
    }
    return true;
  }
}
