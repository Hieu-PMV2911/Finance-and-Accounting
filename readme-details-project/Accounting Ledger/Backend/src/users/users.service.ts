import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Role } from '../common/enums/role.enum.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { User } from './entities/user.entity.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName?: string | null;
  roles?: Role[];
}

export interface UpdateProfileData {
  fullName?: string;
  avatarUrl?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** Tạo người dùng mới. Ném lỗi nếu email đã tồn tại. */
  async create(data: CreateUserData): Promise<User> {
    const email = data.email.toLowerCase().trim();

    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const user = this.users.create({
      email,
      passwordHash: data.passwordHash,
      fullName: data.fullName ?? null,
      roles: data.roles?.length ? data.roles : [Role.MAKER],
    });

    return this.users.save(user);
  }

  /** Tìm theo email, KHÔNG kèm password hash. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  /**
   * Tìm theo email KÈM password hash — chỉ dùng cho luồng đăng nhập.
   * Cột `passwordHash` có `select: false` nên phải addSelect thủ công.
   */
  findByEmailForAuth(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  list(): Promise<User[]> {
    return this.users.find({ order: { createdAt: 'DESC' } });
  }

  async update(
    id: string,
    data: { fullName?: string; roles?: Role[]; isActive?: boolean },
  ): Promise<User> {
    const user = await this.findById(id);

    if (data.fullName !== undefined) user.fullName = data.fullName;
    if (data.roles !== undefined) user.roles = data.roles;
    if (data.isActive !== undefined) user.isActive = data.isActive;

    return this.users.save(user);
  }

  /** Cập nhật hồ sơ của chính người dùng (họ tên, ảnh đại diện). */
  async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    const user = await this.findById(id);

    if (data.fullName !== undefined) {
      user.fullName = data.fullName.trim();
    }
    if (data.avatarUrl !== undefined) {
      const url = data.avatarUrl?.trim();
      user.avatarUrl = url ? url : null;
    }

    return this.users.save(user);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.users.update({ id }, { passwordHash });
  }

  /**
   * Đặt lại mật khẩu (admin). Thu hồi toàn bộ refresh token đang hoạt động
   * để buộc người dùng đăng nhập lại bằng mật khẩu mới.
   */
  async resetPassword(id: string, passwordHash: string): Promise<void> {
    await this.findById(id);
    await this.users.update({ id }, { passwordHash });
    await this.refreshTokens.update(
      { userId: id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async setLastLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }
}
