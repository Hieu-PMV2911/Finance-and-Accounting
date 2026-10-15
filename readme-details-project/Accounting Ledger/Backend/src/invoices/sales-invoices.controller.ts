import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto.js';
import { QuerySalesInvoicesDto } from './dto/query-sales-invoices.dto.js';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto.js';
import { VoidSalesInvoiceDto } from './dto/void-sales-invoice.dto.js';
import { SalesInvoicesService } from './sales-invoices.service.js';

@ApiTags('Sales Invoices')
@ApiBearerAuth()
@Controller('sales-invoices')
export class SalesInvoicesController {
  constructor(private readonly invoices: SalesInvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách hóa đơn bán' })
  list(@Query() query: QuerySalesInvoicesDto) {
    return this.invoices.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết hóa đơn bán' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({ summary: 'Tạo hóa đơn bán (nháp)' })
  create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({ summary: 'Cập nhật hóa đơn bán (chỉ khi chưa ghi sổ)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.update(id, dto, user);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.CHECKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận hóa đơn nháp (admin hoặc người duyệt)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.invoices.approve(id, actorId);
  }

  @Post(':id/post')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ghi sổ hóa đơn bán (tạo bút toán)' })
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.post(id, user.id);
  }

  @Post(':id/void')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hủy hóa đơn bán (admin hoặc người ghi sổ)',
    description:
      'Hóa đơn đã ghi sổ ⇒ sinh bút toán đảo; bút toán gốc không bị sửa. Hóa đơn còn phân bổ thanh toán ⇒ bị từ chối (409).',
  })
  voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidSalesInvoiceDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.invoices.voidInvoice(id, dto, actorId);
  }
}
