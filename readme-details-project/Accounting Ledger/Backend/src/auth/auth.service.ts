import { createHash } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { PasswordService } from '../common/services/password.service.js';
import { parseDurationToSeconds } from '../common/utils/duration.util.js';
import { RefreshToken } from '../users/entities/refresh-token.entity.js';
import type { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Thời hạn access token (giây) */
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** Đăng nhập: trả về cặp access + refresh token. */
  async login(dto: LoginDto): Promise<AuthTokens> {
    // Dùng chung một thông báo lỗi để tránh dò email có tồn tại hay không.
    const invalidCredentials = new UnauthorizedException(
      'Email hoặc mật khẩu không đúng',
    );

    const user = await this.usersService.findByEmailForAuth(dto.email);
    if (!user) {
      throw invalidCredentials;
    }

    const matches = await this.passwordService.compare(
      dto.password,
      user.passwordHash,
    );
    if (!matches) {
      throw invalidCredentials;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    await this.usersService.setLastLogin(user.id);

    return this.issueTokens(user);
  }

  /**
   * Làm mới token. Có rotation: refresh token cũ bị thu hồi ngay khi dùng.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const stored = await this.refreshTokens.findOne({
      where: { tokenHash: this.hashToken(refreshToken) },
    });

    const expired = stored
      ? new Date(stored.expiresAt).getTime() <= Date.now()
      : true;

    if (!stored || stored.revokedAt || expired) {
      throw new UnauthorizedException(
        'Refresh token đã bị thu hồi hoặc hết hạn',
      );
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    // Thu hồi token cũ trước khi phát hành token mới.
    stored.revokedAt = new Date();
    await this.refreshTokens.save(stored);

    return this.issueTokens(user);
  }

  /** Đăng xuất: thu hồi refresh token (idempotent). */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: this.hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Đổi mật khẩu. Thu hồi toàn bộ refresh token để buộc đăng nhập lại.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    const withPassword = await this.usersService.findByEmailForAuth(user.email);

    if (!withPassword) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }

    const matches = await this.passwordService.compare(
      dto.currentPassword,
      withPassword.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.usersService.updatePassword(userId, newHash);

    await this.refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // ---------------------------------------------------------------- helpers

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessTtl = this.accessTtlSeconds();
    const refreshTtl = this.refreshTtlSeconds();

    const base = { sub: user.id, email: user.email, roles: user.roles };

    const accessToken = await this.jwtService.signAsync(
      { ...base, type: 'access' } satisfies JwtPayload,
      { secret: this.accessSecret(), expiresIn: accessTtl },
    );

    const refreshToken = await this.jwtService.signAsync(
      { ...base, type: 'refresh' } satisfies JwtPayload,
      { secret: this.refreshSecret(), expiresIn: refreshTtl },
    );

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        revokedAt: null,
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessSecret(): string {
    return this.config.get<string>('JWT_SECRET') ?? 'change-me-in-production';
  }

  private refreshSecret(): string {
    return this.config.get<string>('JWT_REFRESH_SECRET') ?? this.accessSecret();
  }

  private accessTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get<string>('JWT_EXPIRES_IN') ?? '1d',
    );
  }

  private refreshTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );
  }
}
