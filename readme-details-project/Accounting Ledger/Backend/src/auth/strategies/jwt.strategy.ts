import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

/**
 * Xác thực access token từ header `Authorization: Bearer <token>`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
    });
  }

  validate(payload: JwtPayload): AuthUser {
    // Chỉ access token mới được dùng để gọi API.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
    };
  }
}
