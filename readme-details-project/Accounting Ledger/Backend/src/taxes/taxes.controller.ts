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

import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CreateTaxCodeDto } from './dto/create-tax-code.dto.js';
import { QueryTaxCodesDto } from './dto/query-tax-codes.dto.js';
import { UpdateTaxCodeDto } from './dto/update-tax-code.dto.js';
import { TaxCodesService } from './tax-codes.service.js';

/**
 * Mã thuế (mục 10.C.2).
 *
 * Đọc: mọi người dùng đã đăng nhập (màn hình lập hóa đơn cần chọn mã thuế).
 * Ghi: `admin` — thuế suất ảnh hưởng tới **mọi** chứng từ nên chỉ quản trị được đổi.
 */
@ApiTags('Taxes')
@ApiBearerAuth()
@Controller('taxes')
export class TaxesController {
  constructor(private readonly taxCodesService: TaxCodesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách mã thuế' })
  @ApiOkResponse({ description: 'Danh sách mã thuế (lọc theo loại/trạng thái/từ khóa)' })
  list(@Query() query: QueryTaxCodesDto) {
    return this.taxCodesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết mã thuế' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxCodesService.findById(id);
  }

  @Get(':id/usage')
  @ApiOperation({
    summary: 'Số dòng chứng từ đang dùng mã thuế',
    description: 'Dùng để biết còn xóa được không: đã dùng thì chỉ ngừng sử dụng.',
  })
  async usage(@Param('id', ParseUUIDPipe) id: string) {
    const taxCode = await this.taxCodesService.findById(id);
    const lines = await this.taxCodesService.usageCount(id);
    return {
      taxCodeId: id,
      code: taxCode.code,
      documentLines: lines,
      deletable: lines === 0,
    };
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Tạo mã thuế (chỉ admin)' })
  @ApiCreatedResponse({ description: 'Mã thuế đã tạo' })
  create(@Body() dto: CreateTaxCodeDto) {
    return this.taxCodesService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật mã thuế (chỉ admin)',
    description:
      'Sửa thuế suất KHÔNG làm đổi chứng từ đã lập — mỗi dòng đã lưu thuế suất tại thời điểm lập.',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaxCodeDto) {
    return this.taxCodesService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa mã thuế chưa dùng (chỉ admin)',
    description: 'Mã thuế đã gắn vào dòng chứng từ sẽ bị từ chối (409).',
  })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.taxCodesService.remove(id);
  }
}
