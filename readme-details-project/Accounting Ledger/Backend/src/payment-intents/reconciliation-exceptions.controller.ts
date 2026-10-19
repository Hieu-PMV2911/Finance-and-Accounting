import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import {
  QueryReconciliationExceptionsDto,
  ResolveExceptionDto,
} from './dto/query-reconciliation-exceptions.dto.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';

/**
 * Ngoại lệ đối soát (mục 10.B).
 *
 * Đây là **hàng đợi việc cho con người**: mọi chỗ hệ thống từ chối đoán (số tiền
 * lệch, kết quả đến trễ mâu thuẫn, provider im lặng quá ngưỡng) đều nằm đây.
 * Xử lý/bỏ qua đều bắt buộc ghi lại người và ghi chú — bỏ qua cũng là một quyết
 * định cần giải thích.
 */
@ApiTags('Reconciliation exceptions')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.POSTER)
@Controller('reconciliation-exceptions')
export class ReconciliationExceptionsController {
  constructor(private readonly exceptions: ReconciliationExceptionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách ngoại lệ (lọc loại/trạng thái/intent)',
  })
  @ApiOkResponse({ description: 'Ngoại lệ mới nhất trước' })
  list(@Query() query: QueryReconciliationExceptionsDto) {
    return this.exceptions.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một ngoại lệ (kèm bằng chứng trong detail)' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.exceptions.findById(id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đánh dấu đã xử lý (kèm ghi chú giải thích quyết định)',
  })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.exceptions.resolve(id, dto, actorId);
  }

  @Post(':id/ignore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bỏ qua ngoại lệ (vẫn lưu người quyết định và lý do)',
  })
  ignore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.exceptions.ignore(id, dto, actorId);
  }
}
