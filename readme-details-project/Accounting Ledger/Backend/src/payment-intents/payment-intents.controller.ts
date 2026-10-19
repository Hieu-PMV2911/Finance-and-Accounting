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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto.js';
import { QueryPaymentIntentsDto } from './dto/query-payment-intents.dto.js';
import { PaymentIntentsService } from './payment-intents.service.js';

/**
 * Ý định thanh toán qua provider (mục 10.B — P2.1).
 *
 * Khác phiếu thu/chi (mục 10.A) ở chỗ tiền do **hệ thống ngoài** thu: ta không
 * tự quyết định thành công. Vì vậy API ở đây chỉ có bốn việc: tạo, xem, tra
 * cứu lại, và đánh dấu tiền đã về tài khoản.
 *
 * Tạo intent là thao tác của `maker` (người lập); tra cứu lại và đánh dấu về
 * tài khoản là của `poster` — cùng logic tách trách nhiệm với chứng từ 10.A.
 */
@ApiTags('Payment intents')
@ApiBearerAuth()
@Controller('payment-intents')
export class PaymentIntentsController {
  constructor(private readonly intents: PaymentIntentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách giao dịch thanh toán (lọc trạng thái/chiều/đối tượng/ngày)',
  })
  @ApiOkResponse({ description: 'Danh sách intent kèm đối tượng' })
  list(@Query() query: QueryPaymentIntentsDto) {
    return this.intents.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một giao dịch thanh toán' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.intents.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({
    summary: 'Tạo giao dịch và gọi provider (admin hoặc người lập)',
    description:
      'Idempotent theo idempotencyKey. Timeout của provider ⇒ trạng thái "chưa xác định", KHÔNG coi là thất bại; cron sẽ tra cứu lại. Kỳ đã khóa hoặc thiếu tài khoản tiền bị chặn trước khi gọi provider.',
  })
  @ApiCreatedResponse({ description: 'Intent đã tạo (kèm kết luận provider nếu có)' })
  create(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.intents.create(dto, actorId);
  }

  @Post(':id/poll')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tra cứu lại provider (admin hoặc người ghi sổ)',
    description:
      'Tra theo idempotencyKey. Đã thu tiền ⇒ ghi sổ đúng một lần; kết quả mâu thuẫn trạng thái cuối ⇒ không ghi đè, sinh ngoại lệ đối soát.',
  })
  poll(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.intents.poll(id, actorId);
  }

  @Post(':id/settle')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đánh dấu tiền đã về tài khoản ngân hàng (admin hoặc người ghi sổ)',
    description: 'Chỉ áp dụng cho giao dịch đã thu tiền; bút toán đã có từ bước captured.',
  })
  settle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.intents.settle(id, actorId);
  }
}
