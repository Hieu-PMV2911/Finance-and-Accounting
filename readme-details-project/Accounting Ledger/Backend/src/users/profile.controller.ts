import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';
import { toPublicUser } from './user.mapper.js';

/**
 * Hồ sơ của chính người dùng đang đăng nhập (không cần quyền admin).
 */
@ApiTags('Profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Xem hồ sơ của tôi' })
  @ApiOkResponse({ description: 'Hồ sơ người dùng hiện tại' })
  async me(@CurrentUser('id') userId: string) {
    const user = await this.usersService.findById(userId);
    return toPublicUser(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Cập nhật hồ sơ của tôi (họ tên, ảnh đại diện)' })
  async update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    const user = await this.usersService.updateProfile(userId, {
      fullName: dto.fullName,
      avatarUrl: dto.avatarUrl,
    });
    return toPublicUser(user);
  }
}
