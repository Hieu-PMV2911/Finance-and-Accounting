import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { QueryNotificationsDto } from './dto/query-notifications.dto.js';
import type { Notification } from './entities/notification.entity.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Thông báo trong hệ thống (mục 9).
 *
 * Đây là **đầu ra** của mọi job nền: nhắc công nợ, báo cáo sinh xong, cảnh báo
 * vi phạm bất biến. Phạm vi hiển thị do backend quyết định theo người dùng và
 * vai trò (xem `NotificationsService`).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo nhìn thấy được (lọc + phân trang)' })
  @ApiOkResponse({ description: 'Danh sách thông báo, mới nhất trước' })
  list(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Notification[]> {
    return this.notifications.list(query, user);
  }

  // Khai báo trước `:id` để "unread-count" không bị nuốt bởi route động.
  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc (dùng cho badge)' })
  async unreadCount(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(user) };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Đánh dấu đã đọc mọi thông báo của tôi' })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(user) };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Notification> {
    return this.notifications.markRead(id, user);
  }
}
