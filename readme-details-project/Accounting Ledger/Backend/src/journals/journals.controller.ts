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
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto.js';
import { QueryJournalsDto } from './dto/query-journals.dto.js';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto.js';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto.js';
import { JournalsService } from './journals.service.js';

@ApiTags('Journals')
@ApiBearerAuth()
@Controller('journals')
export class JournalsController {
  constructor(private readonly journalsService: JournalsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách bút toán (có lọc + phân trang)' })
  @ApiOkResponse({ description: 'Danh sách bút toán kèm dòng định khoản' })
  list(@Query() query: QueryJournalsDto) {
    return this.journalsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết bút toán' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.journalsService.findById(id);
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Post()
  @ApiOperation({ summary: 'Lập bút toán nháp (admin hoặc người lập)' })
  @ApiCreatedResponse({ description: 'Bút toán nháp đã tạo' })
  create(
    @Body() dto: CreateJournalEntryDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.journalsService.create(dto, actorId);
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Patch(':id')
  @ApiOperation({ summary: 'Sửa bút toán nháp (admin hoặc người lập)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journalsService.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.MAKER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa bút toán nháp (admin hoặc người lập)' })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.journalsService.remove(id);
  }

  @Roles(Role.ADMIN, Role.CHECKER)
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận bút toán nháp (admin hoặc người duyệt)' })
  @ApiOkResponse({ description: 'Bút toán đã xác nhận, sẵn sàng ghi sổ' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.journalsService.approve(id, actorId);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ghi sổ bút toán đã xác nhận (admin hoặc người ghi sổ)' })
  @ApiOkResponse({ description: 'Bút toán đã ghi sổ, số dư đã cập nhật' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.journalsService.post(id, actorId);
  }

  @Roles(Role.ADMIN, Role.POSTER)
  @Post(':id/reverse')
  @ApiOperation({
    summary: 'Đảo bút toán đã ghi sổ bằng bút toán điều chỉnh',
  })
  @ApiCreatedResponse({
    description: 'Bút toán đảo mới (đã ghi sổ); bút toán gốc chuyển sang "reversed"',
  })
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseJournalEntryDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.journalsService.reverse(id, dto, actorId);
  }
}
