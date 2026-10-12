import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { PasswordService } from '../common/services/password.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import type { User } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

/** Loại bỏ password hash trước khi trả về client. */
function toPublicUser(user: User) {
  const safe: Record<string, unknown> = { ...user };
  delete safe.passwordHash;
  return safe;
}

@ApiTags('Users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách người dùng (chỉ admin)' })
  @ApiOkResponse({ description: 'Danh sách người dùng' })
  async list() {
    const users = await this.usersService.list();
    return users.map(toPublicUser);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo người dùng mới (chỉ admin)' })
  @ApiCreatedResponse({ description: 'Người dùng đã tạo' })
  async create(@Body() dto: CreateUserDto) {
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      roles: dto.roles,
    });
    return toPublicUser(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết người dùng (chỉ admin)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id);
    return toPublicUser(user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật hồ sơ / vai trò / trạng thái (chỉ admin)',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, {
      fullName: dto.fullName,
      roles: dto.roles,
      isActive: dto.isActive,
    });
    return toPublicUser(user);
  }
}
