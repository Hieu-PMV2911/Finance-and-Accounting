import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { ExchangeRatesService } from './exchange-rates.service.js';
import { LookupExchangeRateDto } from './dto/lookup-exchange-rate.dto.js';
import { QueryExchangeRatesDto } from './dto/query-exchange-rates.dto.js';
import { UpsertExchangeRateDto } from './dto/upsert-exchange-rate.dto.js';

/**
 * Bảng tỷ giá nhập tay (mục 10.C.1).
 *
 * Quyết định đã chốt: nguồn tỷ giá là **bảng nhập tay**; tự động lấy tỷ giá từ nhà
 * cung cấp là hạng mục tùy chọn về sau. Cột `source` đã có sẵn nên khi tích hợp chỉ
 * cần ghi thêm nguồn, không phải đổi lược đồ.
 *
 * Đọc: mọi người dùng đã đăng nhập (màn hình nhập liệu cần tra tỷ giá).
 * Ghi: `admin` + `maker`.
 */
@ApiTags('Exchange Rates')
@ApiBearerAuth()
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách tỷ giá (mới nhất trước)' })
  @ApiOkResponse({ description: 'Danh sách tỷ giá' })
  list(@Query() query: QueryExchangeRatesDto) {
    return this.exchangeRatesService.list(query);
  }

  @Get('latest')
  @ApiOperation({
    summary: 'Tỷ giá mới nhất của từng loại tiền',
    description: 'Dùng cho màn hình nhập liệu và seed — không phải giá trị đã dùng để ghi sổ.',
  })
  latest() {
    return this.exchangeRatesService.latestPerCurrency();
  }

  @Get('lookup')
  @ApiOperation({
    summary: 'Tra tỷ giá áp dụng cho một ngày',
    description:
      'Trả tỷ giá của ngày gần nhất không muộn hơn ngày cần tra, kèm cờ `fallback` khi phải dùng bản ghi cũ hơn. Không nội suy giữa hai mốc.',
  })
  async lookup(@Query() query: LookupExchangeRateDto) {
    const asOfDate = query.date ?? new Date().toISOString().slice(0, 10);
    const resolved = await this.exchangeRatesService.requireRate(
      query.currency,
      asOfDate,
    );
    return { ...resolved, asOfDate };
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Post()
  @ApiOperation({
    summary: 'Khai / cập nhật tỷ giá (admin, maker)',
    description:
      'Upsert theo (mã tiền, ngày áp dụng): ghi lại cùng ngày là cập nhật, không tạo dòng thứ hai.',
  })
  @ApiCreatedResponse({ description: 'Bản ghi tỷ giá đã lưu' })
  upsert(@Body() dto: UpsertExchangeRateDto) {
    return this.exchangeRatesService.upsert(dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa bản ghi tỷ giá (chỉ admin)',
    description:
      'An toàn với dữ liệu đã ghi sổ: `journal_lines.fx_rate` đã sao lại tỷ giá nên xóa bảng này không làm sai bút toán cũ.',
  })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.exchangeRatesService.remove(id);
  }
}
