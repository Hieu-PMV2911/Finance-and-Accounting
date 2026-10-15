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
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { ConfirmMatchDto } from './dto/confirm-match.dto.js';
import { QueryExceptionsDto } from './dto/query-exceptions.dto.js';
import { ResolveExceptionDto } from './dto/resolve-exception.dto.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * **Khớp & danh sách giao dịch lệch** (mục 10.B).
 *
 * Hai nhóm:
 * - `/reconciliation-matches` — dòng khớp giữa sao kê và chứng từ nội bộ (n-n,
 *   lưu `amount` từng dòng để biểu diễn khớp một phần).
 * - `/reconciliation-exceptions` — danh sách lệch có quy trình xử lý thủ công;
 *   chỉ được chuyển trạng thái kèm lý do, **không** xoá (đó là bằng chứng).
 */
@ApiTags('Reconciliation')
@ApiBearerAuth()
@Controller()
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly exceptions: ReconciliationExceptionsService,
  ) {}

  // ------------------------------------------------------------------ khớp

  @Get('reconciliation-matches')
  @ApiOperation({ summary: 'Danh sách dòng khớp (lọc theo dòng sao kê)' })
  @ApiOkResponse({ description: 'Danh sách dòng khớp' })
  listMatches(@Query('statementLineId') statementLineId?: string) {
    return this.reconciliation.listMatches(statementLineId);
  }

  @Post('reconciliation-matches')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({
    summary: 'Xác nhận khớp thủ công một dòng sao kê với chứng từ nội bộ',
    description:
      'Bỏ trống `amount` ⇒ khớp đúng số tiền dòng sao kê. Khai nhỏ hơn ⇒ khớp một phần.',
  })
  @ApiCreatedResponse({ description: 'Dòng khớp vừa tạo/cập nhật' })
  confirmMatch(@Body() dto: ConfirmMatchDto, @CurrentUser() user: AuthUser) {
    return this.reconciliation.confirmMatch(dto, user);
  }

  @Delete('reconciliation-matches/:id')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gỡ một dòng khớp' })
  async removeMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.reconciliation.removeMatch(id, user);
  }

  // ------------------------------------------------------------- danh sách lệch

  @Get('reconciliation-exceptions')
  @ApiOperation({ summary: 'Danh sách giao dịch lệch (lọc theo trạng thái/loại/sao kê)' })
  @ApiOkResponse({ description: 'Danh sách lệch, mới nhất trước' })
  listExceptions(@Query() query: QueryExceptionsDto) {
    return this.exceptions.list(query);
  }

  @Get('reconciliation-exceptions/stats')
  @ApiOperation({ summary: 'Số lượng giao dịch lệch theo trạng thái' })
  @ApiOkResponse({ description: 'Thống kê nhanh' })
  stats() {
    return this.exceptions.countByStatus();
  }

  @Get('reconciliation-exceptions/:id')
  @ApiOperation({ summary: 'Chi tiết một giao dịch lệch' })
  findException(@Param('id', ParseUUIDPipe) id: string) {
    return this.exceptions.findById(id);
  }

  @Patch('reconciliation-exceptions/:id')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({
    summary: 'Xử lý / bỏ qua một giao dịch lệch (kèm lý do)',
    description: 'Mọi thao tác tự động vào audit log. Không có thao tác xoá.',
  })
  @ApiOkResponse({ description: 'Dòng lệch sau khi xử lý' })
  resolveException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.exceptions.resolve(id, dto, user);
  }
}
