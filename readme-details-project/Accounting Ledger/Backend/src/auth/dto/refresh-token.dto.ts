import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token nhận được từ /auth/login' })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu refresh token' })
  refreshToken: string;
}
