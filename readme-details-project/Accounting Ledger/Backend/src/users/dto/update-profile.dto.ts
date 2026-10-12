import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Họ tên tối đa 255 ký tự' })
  fullName?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL ảnh đại diện; để trống hoặc null để xóa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512, { message: 'URL ảnh đại diện tối đa 512 ký tự' })
  avatarUrl?: string | null;
}
