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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import {
  JobName,
  JobQueue,
  JobTrigger,
} from '../jobs/enums/job.enum.js';
import { QueueService } from '../jobs/queue.service.js';
import type { IngestStatementDto } from './dto/ingest-statement.dto.js';
import {
  ConfirmMatchDto,
  CreateBankAdjustmentDto,
  QueryBankStatementsDto,
  QueryBankTransactionsDto,
  QueryMatchesDto,
} from './dto/query-reconciliation.dto.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * Đối soát ngân hàng (mục 10.B — P2.2/P2.3).
 *
 * Nạp sao kê chạy **trong job nền** (`statements`) để request không bị chặn
 * đọc/giải mã file lớn — controller trả `202` + job id ngay. Các thao tác khớp
 * và chốt chạy đồng bộ vì chúng là thao tác người dùng cần thấy kết quả ngay.
 *
 * Phân quyền: nạp + khớp + chốt là `poster` (đổi công nợ/sổ cái); chỉ admin
 * mới xem được danh sách kỹ thuật.
 */
@ApiTags('Reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly queue: QueueService,
  ) {}

  // ------------------------------------------------------------ sao kê

  @Get('statements')
  @ApiOperation({ summary: 'Danh sách sao kê (lọc theo tài khoản / trạng thái)' })
  listStatements(@Query() query: QueryBankStatementsDto) {
    return this.reconciliation.listStatements(query);
  }

  @Get('statements/:id')
  @ApiOperation({ summary: 'Chi tiết một sao kê' })
  findStatement(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.findStatementById(id);
  }

  @Post('statements')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Nạp sao kê (chạy nền, trả 202 + job id)',
    description:
      'Nội dung CSV/JSON được chuẩn hóa và nạp qua job `statements`. Chống trùng theo (tài khoản, mã ngân hàng, số tiền, ngày).',
  })
  async ingest(
    @Body() dto: IngestStatementDto,
    @CurrentUser('id') actorId: string,
  ) {
    const run = await this.queue.enqueue({
      queue: JobQueue.STATEMENTS,
      jobName: JobName.IMPORT_STATEMENT,
      payload: { ...dto, actorId },
      trigger: JobTrigger.API,
    });
    return { accepted: true, jobRunId: run.id, queue: run.queue };
  }

  @Post('statements/:id/reconcile')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chạy pipeline đối soát 3 tầng cho một sao kê',
    description:
      'Mỗi dòng chưa khớp thử tầng tham chiếu → tiền+ngày → gợi ý mờ. Không tầng nào khớp ⇒ ghi ngoại lệ missing_internal.',
  })
  reconcile(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.reconcileStatement(id);
  }

  @Post('statements/:id/resolve')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chốt sao kê (bất biến — mọi dòng phải khớp hết)',
    description: 'Còn dòng unmatched/suggested ⇒ 409. Số dư đầu/cuối phải khớp phát sinh.',
  })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.reconciliation.resolveStatement(id, actorId);
  }

  // ------------------------------------------------------------ dòng sao

  @Get('transactions')
  @ApiOperation({ summary: 'Danh sách dòng sao kê (lọc trạng thái khớp / chiều / ngày)' })
  listTransactions(@Query() query: QueryBankTransactionsDto) {
    return this.reconciliation.listTransactions(query);
  }

  @Post('transactions/:id/confirm-match')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác nhận một dòng khớp (trên gợi ý hoặc ghép tay)',
    description: 'Số tiền khác số tiền dòng sao ⇒ bắt buộc có ghi chú.',
  })
  confirmMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmMatchDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.reconciliation.confirmMatch(id, dto, actorId);
  }

  @Post('transactions/:id/adjustment')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tạo bút toán phí/lãi ngân hàng cho một dòng sao chưa khớp',
    description:
      'Đi qua JournalsService, source_type = bank_transaction, cập nhật trạng thái dòng trong cùng transaction.',
  })
  createAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBankAdjustmentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.reconciliation.createBankAdjustment(id, dto, actorId);
  }

  // ------------------------------------------------------------ dòng khớp

  @Get('matches')
  @ApiOperation({ summary: 'Danh sách dòng khớp (lọc theo loại/chứng từ)' })
  listMatches(@Query() query: QueryMatchesDto) {
    return this.reconciliation.listMatches(query);
  }

  @Delete('matches/:id')
  @Roles(Role.ADMIN, Role.POSTER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Gỡ một dòng khớp (luôn để lại lý do)',
  })
  async unmatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser('id') actorId: string,
  ): Promise<void> {
    await this.reconciliation.unmatch(id, body?.reason ?? null, actorId);
  }
}
