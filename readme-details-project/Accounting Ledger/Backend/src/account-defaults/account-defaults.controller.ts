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
import { AccountDefaultsService } from './account-defaults.service.js';
import { CreateAccountDefaultRuleDto } from './dto/create-account-default-rule.dto.js';
import { QueryAccountDefaultRulesDto } from './dto/query-account-default-rules.dto.js';
import { UpdateAccountDefaultRuleDto } from './dto/update-account-default-rule.dto.js';

/**
 * Luật mặc định tài khoản (mục 10.A).
 *
 * Đọc: mọi người dùng đã đăng nhập (người lập cần biết dòng sẽ vào tài khoản nào).
 * Ghi: **admin** — đây là chính sách kế toán của doanh nghiệp, đồng bộ với cách phân
 * quyền của danh mục tài khoản (`AccountsController`).
 */
@ApiTags('Account Defaults')
@ApiBearerAuth()
@Controller('account-defaults')
export class AccountDefaultsController {
  constructor(private readonly accountDefaults: AccountDefaultsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách luật mặc định tài khoản' })
  @ApiOkResponse({ description: 'Danh sách luật (kèm tài khoản đích)' })
  list(@Query() query: QueryAccountDefaultRulesDto) {
    return this.accountDefaults.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết luật mặc định tài khoản' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountDefaults.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo luật mặc định tài khoản (chỉ admin)' })
  @ApiCreatedResponse({ description: 'Luật đã tạo' })
  create(@Body() dto: CreateAccountDefaultRuleDto) {
    return this.accountDefaults.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật luật mặc định tài khoản (chỉ admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDefaultRuleDto,
  ) {
    return this.accountDefaults.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa luật mặc định tài khoản (chỉ admin)' })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.accountDefaults.remove(id);
  }
}
