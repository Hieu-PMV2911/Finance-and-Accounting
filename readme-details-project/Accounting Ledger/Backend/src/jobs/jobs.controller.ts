import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import {
  REPORT_FORMAT_MIME,
  type ReportFormat,
} from '../reports/enums/report.enum.js';
import { BalanceSnapshotDto } from './dto/balance-snapshot.dto.js';
import { EnqueueReportDto } from './dto/enqueue-report.dto.js';
import { IntegrityCheckDto } from './dto/integrity-check.dto.js';
import { QueryJobRunsDto } from './dto/query-job-runs.dto.js';
import { JobName, JobQueue, JobTrigger } from './enums/job.enum.js';
import { JobRunsService } from './job-runs.service.js';
import { QueueService } from './queue.service.js';
import type { JobRunView } from './interfaces/job-view.interface.js';
import { ReportStorageService } from './report-storage.service.js';
import { SchedulesService } from './schedules.service.js';

/**
 * Xử lý bất đồng bộ (mục 9).
 *
 * Ba nhóm chức năng:
 * - **Giám sát**: xem tình trạng hàng đợi, lịch sử lượt chạy, lịch định kỳ.
 * - **Kích hoạt**: xếp job bằng tay (sinh báo cáo, kiểm tra bất biến, chốt số
 *   dư, chạy một lịch) — để không phải chờ tới mốc cron.
 * - **Khắc phục**: thử lại job đã thất bại, tải file báo cáo đã sinh.
 *
 * Quyền: xem và xếp báo cáo thì mọi người dùng đã đăng nhập đều được (báo cáo là
 * dữ liệu chỉ đọc); các thao tác ảnh hưởng dữ liệu (`integrity-checks` ghi cảnh
 * báo, `balance-snapshot` có thể ghi lại số dư, `retry`) thì giới hạn theo vai
 * trò — số dư là chuyện của `poster`/`admin`.
 */
@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly queue: QueueService,
    private readonly runs: JobRunsService,
    private readonly schedules: SchedulesService,
    private readonly storage: ReportStorageService,
  ) {}

  // ------------------------------------------------------------ giám sát

  @Get('overview')
  @ApiOperation({
    summary: 'Tình trạng hàng đợi + số lượt chạy theo trạng thái',
    description:
      'Số đếm hàng đợi đọc trực tiếp từ Redis; nếu Redis không kết nối được thì reachable = false và số đếm bằng 0 (lịch sử trong DB vẫn xem được).',
  })
  @ApiOkResponse({ description: 'Tổng quan xử lý bất đồng bộ' })
  async overview() {
    const [queues, runs] = await Promise.all([
      this.queue.overview(),
      this.runs.countByStatus(),
    ]);
    return {
      queues,
      runs,
      schedulingEnabled: this.schedules.schedulingEnabled,
    };
  }

  @Get('queues')
  @ApiOperation({ summary: 'Số lượng job theo trạng thái của từng hàng đợi' })
  @ApiOkResponse({ description: 'Danh sách hàng đợi' })
  queues() {
    return this.queue.overview();
  }

  @Get('schedules')
  @ApiOperation({
    summary: 'Danh mục lịch định kỳ (cron) kèm lần chạy gần nhất / kế tiếp',
  })
  @ApiOkResponse({ description: 'Danh sách lịch định kỳ' })
  listSchedules() {
    return this.schedules.list();
  }

  @Post('schedules/:name/trigger')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({ summary: 'Chạy ngay một lịch định kỳ (không chờ cron)' })
  @ApiCreatedResponse({ description: 'Lượt chạy vừa được xếp' })
  async triggerSchedule(
    @Param('name') name: string,
    @CurrentUser() user: AuthUser,
  ): Promise<JobRunView> {
    const run = await this.schedules.trigger(name, user);
    return this.runs.toView(run);
  }

  @Get('runs')
  @ApiOperation({ summary: 'Lịch sử lượt chạy job (lọc + phân trang)' })
  @ApiOkResponse({ description: 'Danh sách lượt chạy, mới nhất trước' })
  async listRuns(@Query() query: QueryJobRunsDto): Promise<JobRunView[]> {
    const runs = await this.runs.list(query);
    return runs.map((run) => this.runs.toView(run));
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Chi tiết một lượt chạy job' })
  async findRun(@Param('id', ParseUUIDPipe) id: string): Promise<JobRunView> {
    return this.runs.toView(await this.runs.findById(id));
  }

  @Post('runs/:id/retry')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({ summary: 'Thử lại một job đã thất bại' })
  @ApiCreatedResponse({ description: 'Lượt chạy mới' })
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<JobRunView> {
    return this.runs.toView(await this.queue.retry(id, user));
  }

  @Get('runs/:id/download')
  @ApiOperation({ summary: 'Tải file báo cáo do job sinh ra' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const run = await this.runs.findById(id);
    const format = run.result?.format;
    const filename = run.result?.filename;

    if (typeof format !== 'string' || typeof filename !== 'string') {
      throw new BadRequestException('Lượt chạy này không sinh file báo cáo');
    }

    const buffer = await this.storage.read(id, format);
    if (!buffer) {
      throw new NotFoundException('File báo cáo không còn trên máy chủ');
    }

    res.setHeader(
      'Content-Type',
      REPORT_FORMAT_MIME[format as ReportFormat] ?? 'application/octet-stream',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  // ----------------------------------------------------------- kích hoạt

  @Post('reports')
  @ApiOperation({
    summary: 'Xếp job sinh báo cáo tài chính ở chế độ nền',
    description:
      'Không truyền format ⇒ job chỉ tính số liệu và trả tóm tắt trong kết quả. Có format (xlsx|pdf) ⇒ job sinh file và thông báo khi xong.',
  })
  @ApiCreatedResponse({ description: 'Lượt chạy vừa được xếp' })
  async enqueueReport(
    @Body() dto: EnqueueReportDto,
    @CurrentUser() user: AuthUser,
  ): Promise<JobRunView> {
    const run = await this.queue.enqueue({
      queue: JobQueue.REPORTS,
      jobName: JobName.GENERATE_REPORT,
      trigger: JobTrigger.API,
      actor: user,
      payload: {
        kind: dto.kind,
        format: dto.format,
        periodId: dto.periodId,
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        requestedBy: user.id,
        requestedByEmail: user.email,
      },
    });

    return this.runs.toView(run);
  }

  @Post('integrity-checks')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Chạy kiểm tra bất biến ngay',
    description:
      '7 kiểm tra: Σ Nợ = Σ Có, số dư tái lập được, kỳ bị đóng băng, dòng mồ côi, số tiền sai quy tắc, ghi vào tài khoản cha, số hiệu trùng.',
  })
  @ApiCreatedResponse({ description: 'Lượt chạy kiểm tra vừa được xếp' })
  async runIntegrityCheck(
    @Body() dto: IntegrityCheckDto,
    @CurrentUser() user: AuthUser,
  ): Promise<JobRunView> {
    const run = await this.queue.enqueue({
      queue: JobQueue.MAINTENANCE,
      jobName: JobName.INTEGRITY_CHECK,
      trigger: JobTrigger.API,
      actor: user,
      payload: { periodId: dto.periodId },
    });

    return this.runs.toView(run);
  }

  @Post('balance-snapshot')
  @Roles(Role.ADMIN, Role.POSTER)
  @ApiOperation({
    summary: 'Chốt số dư một kỳ',
    description:
      'repair = true sẽ ghi lại account_balances theo số liệu tái lập từ bút toán (mặc định chỉ đối chiếu và báo cáo).',
  })
  @ApiCreatedResponse({ description: 'Lượt chốt số dư vừa được xếp' })
  async runBalanceSnapshot(
    @Body() dto: BalanceSnapshotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<JobRunView> {
    const run = await this.queue.enqueue({
      queue: JobQueue.MAINTENANCE,
      jobName: JobName.BALANCE_SNAPSHOT,
      trigger: JobTrigger.API,
      actor: user,
      payload: { periodId: dto.periodId, repair: dto.repair ?? false },
    });

    return this.runs.toView(run);
  }
}
