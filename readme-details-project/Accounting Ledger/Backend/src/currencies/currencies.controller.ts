import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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

import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CurrenciesService } from './currencies.service.js';
import { CreateCurrencyDto } from './dto/create-currency.dto.js';
import { QueryCurrenciesDto } from './dto/query-currencies.dto.js';
import { UpdateCurrencyDto } from './dto/update-currency.dto.js';

/**
 * Danh mục tiền tệ (mục 10.C.1).
 *
 * Đọc: mọi người dùng đã đăng nhập. Ghi: `admin` + `maker` — đồng bộ với danh mục
 * tài khoản và đối tượng.
 */
@ApiTags('Currencies')
@ApiBearerAuth()
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách loại tiền (đơn vị tiền hạch toán đứng đầu)' })
  @ApiOkResponse({ description: 'Danh sách loại tiền' })
  list(@Query() query: QueryCurrenciesDto) {
    return this.currenciesService.list(query.includeInactive ?? false);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Chi tiết loại tiền theo mã ISO 4217' })
  getOne(@Param('code') code: string) {
    return this.currenciesService.findById(code);
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Post()
  @ApiOperation({ summary: 'Thêm loại tiền (admin, maker)' })
  @ApiCreatedResponse({ description: 'Loại tiền đã tạo' })
  create(@Body() dto: CreateCurrencyDto) {
    return this.currenciesService.create(dto);
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Patch(':code')
  @ApiOperation({ summary: 'Cập nhật loại tiền (admin, maker) — không đổi được mã' })
  update(@Param('code') code: string, @Body() dto: UpdateCurrencyDto) {
    return this.currenciesService.update(code, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa loại tiền (chỉ admin)',
    description:
      'Không xóa được đơn vị tiền hạch toán, và không xóa được loại tiền còn bản ghi tỷ giá (409).',
  })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('code') code: string): Promise<void> {
    await this.currenciesService.remove(code);
  }
}
