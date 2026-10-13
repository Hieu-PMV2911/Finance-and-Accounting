import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { AuditService } from './audit.service.js';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto.js';

/**
 * Vết kiểm toán chỉ dành cho `admin`: log chứa toàn bộ lịch sử thay đổi dữ liệu
 * nên là thông tin nhạy cảm.
 */
@ApiTags('Audit')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách vết kiểm toán (có lọc)' })
  @ApiOkResponse({ description: 'Danh sách vết kiểm toán, mới nhất trước' })
  list(@Query() query: QueryAuditLogsDto) {
    return this.audit.list(query);
  }

  // Lưu ý: các route tĩnh phải khai báo TRƯỚC `:id`, nếu không "trace" sẽ bị
  // nuốt bởi `:id` và trả về 400 (id không phải UUID).
  @Get('trace/:entity/:entityId')
  @ApiOperation({ summary: 'Vết kiểm toán của một bản ghi (cũ → mới)' })
  @ApiOkResponse({ description: 'Lịch sử thay đổi của bản ghi' })
  trace(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
  ) {
    return this.audit.trace(entity, entityId);
  }

  @Get('traceability/journal-entries/:id')
  @ApiOperation({
    summary: 'Truy vết bút toán: báo cáo → bút toán → chứng từ nguồn',
    description:
      'Trả về dòng định khoản, kỳ kế toán, số chứng từ gốc và toàn bộ vết kiểm toán của bút toán.',
  })
  @ApiOkResponse({ description: 'Chuỗi truy vết của bút toán' })
  traceJournalEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.traceJournalEntry(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một bản ghi kiểm toán' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.findById(id);
  }
}
