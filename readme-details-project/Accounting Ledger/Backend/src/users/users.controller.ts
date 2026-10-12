import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { PasswordService } from '../common/services/password.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';
import { toPublicUser } from './user.mapper.js';

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

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Đặt lại mật khẩu người dùng (chỉ admin) — thu hồi mọi phiên đăng nhập',
  })
  @ApiNoContentResponse({ description: 'Đã đặt lại mật khẩu' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.usersService.resetPassword(id, passwordHash);
  }
}
