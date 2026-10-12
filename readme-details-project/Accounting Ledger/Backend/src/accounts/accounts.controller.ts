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
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { QueryAccountsDto } from './dto/query-accounts.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách tài khoản (có lọc)' })
  @ApiOkResponse({ description: 'Danh sách tài khoản kế toán' })
  list(@Query() query: QueryAccountsDto) {
    return this.accountsService.list(query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Cây tài khoản phân cấp' })
  @ApiOkResponse({ description: 'Cây tài khoản' })
  tree() {
    return this.accountsService.tree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết tài khoản' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findById(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Tạo tài khoản (chỉ admin)' })
  @ApiCreatedResponse({ description: 'Tài khoản đã tạo' })
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật tài khoản (chỉ admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa tài khoản lá (chỉ admin)' })
  @ApiNoContentResponse({ description: 'Đã xóa' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.accountsService.remove(id);
  }
}
