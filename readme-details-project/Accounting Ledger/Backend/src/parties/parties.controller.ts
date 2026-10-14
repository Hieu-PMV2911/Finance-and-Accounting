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
import { CreatePartyDto } from './dto/create-party.dto.js';
import { QueryPartiesDto } from './dto/query-parties.dto.js';
import { UpdatePartyDto } from './dto/update-party.dto.js';
import { PartiesService } from './parties.service.js';

/**
 * Đối tượng (khách hàng / nhà cung cấp) — mục 10.0.
 *
 * Đọc: mọi người dùng đã đăng nhập. Ghi: `admin` + `maker` (người lập danh mục),
 * đồng bộ với cách phân quyền của danh mục tài khoản và bút toán.
 */
@ApiTags('Parties')
@ApiBearerAuth()
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách đối tượng (lọc theo loại/trạng thái/từ khóa)' })
  @ApiOkResponse({ description: 'Danh sách khách hàng / nhà cung cấp' })
  list(@Query() query: QueryPartiesDto) {
    return this.partiesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết đối tượng' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.partiesService.findById(id);
  }

  @Get(':id/usage')
  @ApiOperation({
    summary: 'Số dòng định khoản đã gắn đối tượng',
    description:
      'Dùng để biết đối tượng còn xóa được không: đã phát sinh thì chỉ ngừng sử dụng.',
  })
  async usage(@Param('id', ParseUUIDPipe) id: string) {
    await this.partiesService.findById(id);
    const lines = await this.partiesService.usageCount(id);
    return { partyId: id, journalLines: lines, deletable: lines === 0 };
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Post()
  @ApiOperation({ summary: 'Tạo đối tượng (admin, maker)' })
  @ApiCreatedResponse({ description: 'Đối tượng đã tạo' })
  create(@Body() dto: CreatePartyDto) {
    return this.partiesService.create(dto);
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật đối tượng (admin, maker)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartyDto) {
    return this.partiesService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa đối tượng chưa phát sinh (chỉ admin)',
    description:
      'Đối tượng đã có dòng định khoản sẽ bị từ chối (409) — hãy ngừng sử dụng thay vì xóa.',
  })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.partiesService.remove(id);
  }
}
