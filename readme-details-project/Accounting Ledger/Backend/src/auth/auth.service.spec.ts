import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Role } from '../common/enums/role.enum.js';
import { PasswordService } from '../common/services/password.service.js';
import { RefreshToken } from '../users/entities/refresh-token.entity.js';
import type { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const activeUser = {
  id: 'user-1',
  email: 'ketoan@example.com',
  passwordHash: 'hashed-password',
  roles: [Role.MAKER],
  isActive: true,
} as User;

const ENV: Record<string, string> = {
  JWT_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  JWT_EXPIRES_IN: '1d',
  JWT_REFRESH_EXPIRES_IN: '7d',
};

function buildService() {
  const usersService = {
    findByEmailForAuth: vi.fn().mockResolvedValue(activeUser),
    findById: vi.fn().mockResolvedValue(activeUser),
    setLastLogin: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  };

  const passwordService = {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('new-hash'),
  };

  const jwtService = {
    signAsync: vi.fn((payload: { type?: string }) =>
      Promise.resolve(payload.type === 'refresh' ? 'refresh-token' : 'access-token'),
    ),
    verifyAsync: vi.fn(),
  };

  const configService = {
    get: vi.fn((key: string) => ENV[key]),
  };

  const refreshTokens = {
    findOne: vi.fn(),
    save: vi.fn((entity: unknown) => Promise.resolve(entity)),
    create: vi.fn((entity: unknown) => entity),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };

  const service = new AuthService(
    usersService as unknown as UsersService,
    passwordService as unknown as PasswordService,
    jwtService as unknown as JwtService,
    configService as unknown as ConfigService,
    refreshTokens as unknown as Repository<RefreshToken>,
  );

  return { service, usersService, passwordService, jwtService, refreshTokens };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  describe('login', () => {
    it('trả về cặp token khi thông tin hợp lệ', async () => {
      const tokens = await ctx.service.login({
        email: 'ketoan@example.com',
        password: 'P@ssw0rd123',
      });

      expect(tokens.accessToken).toBe('access-token');
      expect(tokens.refreshToken).toBe('refresh-token');
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(86_400);
      expect(ctx.usersService.setLastLogin).toHaveBeenCalledWith('user-1');
      // Refresh token phải được lưu dưới dạng hash, không phải token gốc.
      expect(ctx.refreshTokens.save).toHaveBeenCalledOnce();
      const saved = ctx.refreshTokens.save.mock.calls[0][0] as RefreshToken;
      expect(saved.tokenHash).not.toBe('refresh-token');
    });

    it('từ chối khi sai mật khẩu', async () => {
      ctx.passwordService.compare.mockResolvedValue(false);

      await expect(
        ctx.service.login({ email: 'ketoan@example.com', password: 'sai' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('từ chối khi email không tồn tại', async () => {
      ctx.usersService.findByEmailForAuth.mockResolvedValue(null);

      await expect(
        ctx.service.login({ email: 'khong-ton-tai@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('từ chối khi tài khoản bị khóa', async () => {
      ctx.usersService.findByEmailForAuth.mockResolvedValue({
        ...activeUser,
        isActive: false,
      } as User);

      await expect(
        ctx.service.login({ email: 'ketoan@example.com', password: 'P@ssw0rd123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const storedToken = {
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: 'irrelevant',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    } as RefreshToken;

    beforeEach(() => {
      ctx.jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: activeUser.email,
        roles: activeUser.roles,
        type: 'refresh',
      });
      ctx.refreshTokens.findOne.mockResolvedValue({ ...storedToken });
    });

    it('thu hồi token cũ và phát hành cặp token mới (rotation)', async () => {
      const tokens = await ctx.service.refresh('refresh-token');

      expect(tokens.accessToken).toBe('access-token');
      expect(ctx.refreshTokens.save).toHaveBeenCalled();
      const revoked = ctx.refreshTokens.save.mock.calls[0][0] as RefreshToken;
      expect(revoked.revokedAt).toBeInstanceOf(Date);
    });

    it('từ chối token đã bị thu hồi', async () => {
      ctx.refreshTokens.findOne.mockResolvedValue({
        ...storedToken,
        revokedAt: new Date(),
      } as RefreshToken);

      await expect(ctx.service.refresh('refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('từ chối token đã hết hạn', async () => {
      ctx.refreshTokens.findOne.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date(Date.now() - 1000),
      } as RefreshToken);

      await expect(ctx.service.refresh('refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('từ chối token không tìm thấy trong DB', async () => {
      ctx.refreshTokens.findOne.mockResolvedValue(null);

      await expect(ctx.service.refresh('refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('từ chối access token dùng như refresh token', async () => {
      ctx.jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: activeUser.email,
        roles: activeUser.roles,
        type: 'access',
      });

      await expect(ctx.service.refresh('access-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('từ chối khi chữ ký không hợp lệ', async () => {
      ctx.jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));

      await expect(ctx.service.refresh('token-gia')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('đổi mật khẩu và thu hồi mọi refresh token', async () => {
      await ctx.service.changePassword('user-1', {
        currentPassword: 'cu',
        newPassword: 'moi-12345678',
      });

      expect(ctx.passwordService.hash).toHaveBeenCalledWith('moi-12345678');
      expect(ctx.usersService.updatePassword).toHaveBeenCalledWith(
        'user-1',
        'new-hash',
      );
      expect(ctx.refreshTokens.update).toHaveBeenCalledOnce();
    });

    it('từ chối khi mật khẩu hiện tại sai', async () => {
      ctx.passwordService.compare.mockResolvedValue(false);

      await expect(
        ctx.service.changePassword('user-1', {
          currentPassword: 'sai',
          newPassword: 'moi-12345678',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(ctx.usersService.updatePassword).not.toHaveBeenCalled();
    });
  });
});
