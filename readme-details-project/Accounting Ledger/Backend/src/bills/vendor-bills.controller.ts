import {
  Body,
  Controller,
  Get,
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
import { CreateVendorBillDto } from './dto/create-vendor-bill.dto.js';
import { QueryVendorBillsDto } from './dto/query-vendor-bills.dto.js';
import { UpdateVendorBillDto } from './dto/update-vendor-bill.dto.js';
import { VendorBillsService } from './vendor-bills.service.js';

@ApiTags('Vendor Bills')
@ApiBearerAuth()
@Controller('vendor-bills')
export class VendorBillsController {
  constructor(private readonly bills: VendorBillsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách hóa đơn mua' })
  list(@Query() query: QueryVendorBillsDto) {
    return this.bills.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết hóa đơn mua' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bills.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({ summary: 'Tạo hóa đơn mua (nháp)' })
  create(@Body() dto: CreateVendorBillDto, @CurrentUser() user: AuthUser) {
    return this.bills.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MAKER)
  @ApiOperation({ summary: 'Cập nhật hóa đơn mua (chỉ khi chưa ghi sổ)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorBillDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bills.update(id, dto, user.id);
  }

  @Post(':id/post')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({ summary: 'Ghi sổ hóa đơn mua (tạo bút toán)' })
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.bills.post(id, user.id);
  }
}
