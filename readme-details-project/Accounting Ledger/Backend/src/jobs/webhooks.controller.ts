import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto.js';
import { EmitWebhookEventDto } from './dto/emit-webhook-event.dto.js';
import { QueryWebhookDeliveriesDto } from './dto/query-webhook-deliveries.dto.js';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto.js';
import type { WebhookEvent } from './entities/webhook-event.entity.js';
import {
  WebhookEventStatus,
  WEBHOOK_SIGNATURE_HEADER,
} from './enums/webhook.enum.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * Webhook (mục 9) — chỉ `admin` quản trị; riêng route `inbound` là **công khai**
 * vì hệ thống ngoài gọi vào (được bảo vệ bằng chữ ký HMAC, không bằng JWT).
 */
@ApiTags('Webhooks')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  // ------------------------------------------------------------ endpoint

  @Get('endpoints')
  @ApiOperation({
    summary: 'Danh sách endpoint nhận webhook',
    description: 'Không bao giờ trả về khóa ký (secret) — chỉ trả về endpoint đã đăng ký.',
  })
  @ApiOkResponse({ description: 'Danh sách endpoint' })
  listEndpoints() {
    return this.webhooks.listEndpoints();
  }

  @Post('endpoints')
  @ApiOperation({
    summary: 'Đăng ký endpoint nhận webhook',
    description: 'Bỏ trống secret ⇒ hệ thống tự sinh khóa ký HMAC-SHA256.',
  })
  @ApiCreatedResponse({ description: 'Endpoint vừa tạo' })
  createEndpoint(
    @Body() dto: CreateWebhookEndpointDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.webhooks.createEndpoint(dto, user);
  }

  @Get('endpoints/:id')
  @ApiOperation({ summary: 'Chi tiết một endpoint' })
  async findEndpoint(@Param('id', ParseUUIDPipe) id: string) {
    const endpoint = await this.webhooks.findEndpoint(id);
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.subscriptionList(),
      isActive: endpoint.isActive,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
    };
  }

  @Patch('endpoints/:id')
  @ApiOperation({ summary: 'Cập nhật endpoint (đổi URL / sự kiện / bật-tắt / khóa ký)' })
  updateEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.webhooks.updateEndpoint(id, dto);
  }

  @Delete('endpoints/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Xóa endpoint',
    description: 'Nhật ký giao đã gửi được giữ lại để còn đối chiếu.',
  })
  async removeEndpoint(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.webhooks.removeEndpoint(id);
  }

  // --------------------------------------------------------- giao ra ngoài

  @Get('deliveries')
  @ApiOperation({ summary: 'Nhật ký giao webhook (lọc theo endpoint / trạng thái)' })
  @ApiOkResponse({ description: 'Danh sách lần giao, mới nhất trước' })
  listDeliveries(@Query() query: QueryWebhookDeliveriesDto) {
    return this.webhooks.listDeliveries(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê nhanh webhook' })
  stats() {
    return this.webhooks.stats();
  }

  @Post('deliveries/:id/retry')
  @ApiOperation({ summary: 'Thử lại một lần giao đã thất bại' })
  retryDelivery(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.retryDelivery(id);
  }

  @Post('events')
  @ApiOperation({
    summary: 'Phát một sự kiện ra các endpoint đã đăng ký',
    description:
      'Chống giao trùng theo khóa <sự kiện>:<đối tượng>:<endpoint> — gọi lại cùng dữ liệu sẽ không nhân đôi.',
  })
  @ApiCreatedResponse({ description: 'Các lần giao vừa được tạo' })
  emit(@Body() dto: EmitWebhookEventDto, @CurrentUser() user: AuthUser) {
    return this.webhooks.emit(dto, user);
  }

  @Get('events')
  @ApiOperation({
    summary: 'Webhook nhận từ hệ thống ngoài (kèm trạng thái trùng lặp / đến trễ)',
  })
  @ApiOkResponse({ description: 'Danh sách sự kiện nhận vào' })
  listEvents(@Query('limit') limit?: string): Promise<WebhookEvent[]> {
    const parsed = Number(limit ?? 50);
    return this.webhooks.listEvents(
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50,
    );
  }

  // ------------------------------------------------------------ nhận vào

  @Public()
  @Post('inbound')
  @ApiBody({
    description:
      'Envelope bắt buộc: { id, eventType, resourceRef, occurredAt, data }. Header x-webhook-signature = sha256=<hmac> (bắt buộc khi cấu hình WEBHOOK_INBOUND_SECRET).',
  })
  @ApiOperation({
    summary: 'Nhận webhook từ hệ thống ngoài (idempotent, xử lý kết quả đến trễ)',
    description:
      'Trùng lặp (cùng id) trả 200 để bên gửi ngừng retry. Sự kiện cũ hơn sự kiện đã xử lý của cùng đối tượng được ghi nhận là "late" và bỏ qua. Sai chữ ký trả 401.',
  })
  async inbound(
    @Req() request: RawBodyRequest<Request>,
    @Headers(WEBHOOK_SIGNATURE_HEADER) signature: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.webhooks.receiveInbound({
      rawBody: request.rawBody,
      signature,
      body,
    });

    if (result.status === WebhookEventStatus.REJECTED) {
      if ((result.reason ?? '').toLowerCase().includes('chữ ký')) {
        throw new UnauthorizedException(result.reason);
      }
      throw new BadRequestException(result.reason ?? 'Webhook không hợp lệ');
    }

    return {
      received: true,
      status: result.status,
      duplicate: result.status === WebhookEventStatus.DUPLICATE,
      late: result.status === WebhookEventStatus.LATE,
      reason: result.reason,
      eventId: result.eventId,
    };
  }
}
