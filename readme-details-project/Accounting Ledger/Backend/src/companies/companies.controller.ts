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
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { QueryCompaniesDto } from './dto/query-companies.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';

/**
 * Công ty / pháp nhân (mục 10.C).
 *
 * Đọc: mọi người dùng đã đăng nhập (cần biết đơn vị tiền hạch toán đang dùng).
 * Ghi: chỉ `admin` — đây là dữ liệu cấu hình ảnh hưởng tới **mọi** bút toán.
 */
@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách công ty' })
  @ApiOkResponse({ description: 'Danh sách công ty (mặc định đứng đầu)' })
  list(@Query() query: QueryCompaniesDto) {
    return this.companiesService.list(query.includeInactive ?? false);
  }

  @Get('base-currency')
  @ApiOperation({
    summary: 'Đơn vị tiền hạch toán đang dùng',
    description:
      'Mọi giá trị Nợ/Có trong sổ cái đều tính bằng đơn vị này. Trả về "VND" khi hệ thống chưa cấu hình công ty nào.',
  })
  @ApiOkResponse({ description: '{ baseCurrency }' })
  async baseCurrency() {
    return { baseCurrency: await this.companiesService.baseCurrency() };
  }

  @Get('default')
  @ApiOperation({ summary: 'Công ty mặc định' })
  @ApiOkResponse({ description: 'Công ty mặc định, hoặc null nếu chưa cấu hình' })
  default() {
    return this.companiesService.findDefault();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết công ty' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.findById(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Tạo công ty (chỉ admin)' })
  @ApiCreatedResponse({ description: 'Công ty đã tạo' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật công ty (chỉ admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa công ty (chỉ admin)',
    description: 'Công ty mặc định không xóa được (400) — hãy đặt công ty khác làm mặc định trước.',
  })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.companiesService.remove(id);
  }
}
