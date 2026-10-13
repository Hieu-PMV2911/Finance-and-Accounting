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
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto.js';
import { QueryFiscalPeriodsDto } from './dto/query-fiscal-periods.dto.js';
import { UpdateFiscalPeriodDto } from './dto/update-fiscal-period.dto.js';
import { FiscalPeriodsService } from './fiscal-periods.service.js';

@ApiTags('Fiscal Periods')
@ApiBearerAuth()
@Controller('fiscal-periods')
export class FiscalPeriodsController {
  constructor(private readonly periodsService: FiscalPeriodsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách kỳ kế toán (có lọc)' })
  @ApiOkResponse({ description: 'Danh sách kỳ kế toán' })
  list(@Query() query: QueryFiscalPeriodsDto) {
    return this.periodsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết kỳ kế toán' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.findById(id);
  }

  @Get(':id/balances')
  @ApiOperation({ summary: 'Số dư tài khoản trong kỳ' })
  @ApiOkResponse({ description: 'Số dư đầu kỳ / phát sinh / cuối kỳ' })
  balances(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.balances(id);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Post()
  @ApiOperation({ summary: 'Tạo kỳ kế toán (admin hoặc người ghi sổ)' })
  @ApiCreatedResponse({ description: 'Kỳ kế toán đã tạo' })
  create(
    @Body() dto: CreateFiscalPeriodDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.periodsService.create(dto, actorId);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật kỳ đang mở (admin hoặc người ghi sổ)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalPeriodDto,
  ) {
    return this.periodsService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa kỳ đang mở chưa có bút toán (chỉ admin)' })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.periodsService.remove(id);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở lại kỳ đã tạm khóa' })
  @ApiOkResponse({ description: 'Kỳ đã mở lại' })
  open(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.open(id);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tạm khóa kỳ (đóng băng, chặn mọi bút toán)' })
  @ApiOkResponse({ description: 'Kỳ đã tạm khóa' })
  lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.periodsService.lock(id, actorId);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chốt kỳ (không thể mở lại) và chuyển số dư sang kỳ kế tiếp',
  })
  @ApiOkResponse({ description: 'Kỳ đã chốt, số dư đã kết chuyển' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.periodsService.close(id, actorId);
  }
}
