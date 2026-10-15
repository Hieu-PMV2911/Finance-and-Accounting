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
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { BankStatementsService } from './bank-statements.service.js';
import { CreateBankStatementDto } from './dto/create-bank-statement.dto.js';
import { QueryBankStatementsDto } from './dto/query-bank-statements.dto.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * **Sao kê ngân hàng & đối soát** (mục 10.B).
 *
 * Quyền: đọc mọi người dùng đã đăng nhập; mọi thao tác ghi (nhập, khớp, chốt)
 * giới hạn ở `admin`/`poster` — đối soát là chuyện của người ghi sổ.
 */
@ApiTags('Bank Statements')
@ApiBearerAuth()
@Controller('bank-statements')
export class BankStatementsController {
  constructor(
    private readonly statements: BankStatementsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách bảng sao kê ngân hàng' })
  @ApiOkResponse({ description: 'Danh sách sao kê, mới nhất trước' })
  list(@Query() query: QueryBankStatementsDto) {
    return this.statements.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một bảng sao kê' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.statements.findById(id);
  }

  @Get(':id/lines')
  @ApiOperation({ summary: 'Các dòng giao dịch của bảng sao kê' })
  lines(@Param('id', ParseUUIDPipe) id: string) {
    return this.statements.lines(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Nhập sao kê (CSV/JSON) — xử lý nền, trả 202 + id job',
    description:
      'Parser chạy trong job `import-statement` (hàng đợi `statements`): chuẩn hóa → chống trùng → khớp đối soát. Theo dõi tiến độ ở /api/jobs/runs.',
  })
  @ApiCreatedResponse({ description: 'Bảng sao kê vừa tạo + id lượt chạy job nhập' })
  create(@Body() dto: CreateBankStatementDto, @CurrentUser() user: AuthUser) {
    return this.statements.create(dto, user);
  }

  @Post(':id/auto-match')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({
    summary: 'Khớp lại sao kê theo 3 tầng (chính xác → số tiền+ngày → gợi ý)',
    description:
      'Idempotent: chạy lại không nhân đôi dòng khớp (khóa chống trùng theo cặp dòng-khớp).',
  })
  @ApiCreatedResponse({ description: 'Tóm tắt kết quả khớp' })
  autoMatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.autoMatchStatement(id);
  }

  @Post(':id/reconcile')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chốt đối soát sao kê (bất biến sau khi chốt)',
    description: 'Chỉ chốt được khi không còn dòng `unmatched`.',
  })
  reconcile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.statements.reconcile(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá bảng sao kê chưa chốt (kèm các dòng của nó)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.statements.remove(id);
  }
}
