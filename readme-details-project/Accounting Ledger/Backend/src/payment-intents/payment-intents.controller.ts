import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto.js';
import { QueryPaymentIntentsDto } from './dto/query-payment-intents.dto.js';
import { PaymentIntentsService } from './payment-intents.service.js';

/**
 * **Thanh toán** (mục 10.B) — yêu cầu thanh toán qua provider.
 *
 * Quyền: đọc mọi người dùng đã đăng nhập; tạo yêu cầu và tra cứu lại giới hạn ở
 * `admin`/`poster` — đây là thao tác động tới tiền, cùng nhóm quyền với ghi sổ.
 *
 * Điểm cần nhớ khi dùng API: **luôn dùng lại `idempotencyKey` cũ** khi thử lại.
 * Đó là toàn bộ cơ chế "phục hồi mà không tạo giao dịch trùng".
 */
@ApiTags('Payment Intents')
@ApiBearerAuth()
@Controller('payment-intents')
export class PaymentIntentsController {
  constructor(private readonly intents: PaymentIntentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu thanh toán (lọc + phân trang)' })
  @ApiOkResponse({ description: 'Danh sách intent, mới nhất trước' })
  list(@Query() query: QueryPaymentIntentsDto) {
    return this.intents.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một yêu cầu thanh toán' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.intents.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({
    summary: 'Tạo yêu cầu thanh toán (idempotent theo idempotencyKey)',
    description:
      'Provider timeout ở lần gọi đầu ⇒ trạng thái là "unknown" (CHƯA kết luận thất bại). ' +
      'Hệ thống sẽ tự tra cứu lại và chỉ ghi sổ khi có bằng chứng đã thu tiền.',
  })
  @ApiCreatedResponse({ description: 'Yêu cầu thanh toán (mới hoặc đã tồn tại theo idempotencyKey)' })
  create(@Body() dto: CreatePaymentIntentDto, @CurrentUser() user: AuthUser) {
    return this.intents.create(dto, user);
  }

  @Post(':id/refresh')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tra cứu lại provider cho một yêu cầu thanh toán',
    description:
      'Dùng lại đúng idempotencyKey để provider trả về cùng giao dịch. Chỉ ghi sổ khi có bằng chứng đã thu tiền.',
  })
  @ApiOkResponse({ description: 'Yêu cầu thanh toán sau khi tra cứu' })
  refresh(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.intents.refresh(id, user);
  }

  @Post(':id/poll')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({ summary: 'Xếp job tra cứu lại ở chế độ nền (không chặn request)' })
  @ApiCreatedResponse({ description: 'Lượt chạy job vừa được xếp' })
  enqueueRefresh(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.intents.enqueueRefresh(id, user);
  }
}
