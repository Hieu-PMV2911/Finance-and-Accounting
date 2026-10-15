import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CreateAllocationDto } from './dto/create-allocation.dto.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { QueryPaymentsDto } from './dto/query-payments.dto.js';
import { UpdatePaymentDto } from './dto/update-payment.dto.js';
import { VoidPaymentDto } from './dto/void-payment.dto.js';
import { PaymentAllocationsService } from './payment-allocations.service.js';
import { PaymentsService } from './payments.service.js';

/**
 * Phiếu thu / phiếu chi (mục 10.A).
 *
 * Phân quyền y như bút toán: `maker` lập · `checker` duyệt · `poster` ghi sổ.
 * Phân bổ thanh toán là thao tác của **poster** — nó thay đổi công nợ.
 */
@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly allocations: PaymentAllocationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách phiếu thu/chi (lọc theo chiều/trạng thái/đối tượng)' })
  @ApiOkResponse({ description: 'Danh sách phiếu kèm đối tượng' })
  list(@Query() query: QueryPaymentsDto) {
    return this.payments.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết phiếu thu/chi' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({ summary: 'Tạo phiếu thu/chi (nháp)' })
  @ApiCreatedResponse({ description: 'Phiếu đã tạo' })
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.payments.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({ summary: 'Cập nhật phiếu (chỉ khi chưa ghi sổ)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.payments.update(id, dto, actorId);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.CHECKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận phiếu nháp (admin hoặc người duyệt)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.payments.approve(id, actorId);
  }

  @Post(':id/post')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ghi sổ phiếu (admin hoặc người ghi sổ)',
    description:
      'Phiếu thu: Nợ 111/112 · Có 131. Phiếu chi: Nợ 331 · Có 111/112. Ghi sổ lại là idempotent.',
  })
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payments.post(id, actorId);
  }

  @Post(':id/void')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hủy phiếu (admin hoặc người ghi sổ)',
    description:
      'Đã ghi sổ ⇒ sinh bút toán đảo. Còn phân bổ ⇒ bị từ chối (409).',
  })
  voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPaymentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.payments.voidPayment(id, dto, actorId);
  }

  @Get(':id/allocations')
  @ApiOperation({ summary: 'Danh sách phân bổ của phiếu' })
  @ApiOkResponse({ description: 'Phân bổ kèm số chứng từ đích' })
  listAllocations(@Param('id', ParseUUIDPipe) id: string) {
    return this.allocations.list(id);
  }

  @Post(':id/allocations')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({
    summary: 'Đặt số tiền phân bổ của phiếu vào một hóa đơn (admin hoặc người ghi sổ)',
    description:
      'Idempotent theo cặp (phiếu, hóa đơn): gửi lại cùng số tiền cho kết quả y hệt. Bị chặn khi vượt số còn lại của phiếu hoặc của hóa đơn.',
  })
  @ApiCreatedResponse({ description: 'Phân bổ đã đặt' })
  allocate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAllocationDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.allocations.allocate(id, dto, actorId);
  }

  @Delete(':id/allocations/:allocationId')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gỡ phân bổ (admin hoặc người ghi sổ)' })
  @ApiNoContentResponse({ description: 'Đã gỡ' })
  async unallocate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ): Promise<void> {
    await this.allocations.unallocate(id, allocationId);
  }
}
