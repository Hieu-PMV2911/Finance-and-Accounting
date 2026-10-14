import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PartyType } from '../../common/enums/party-type.enum.js';

export class QueryPartiesDto {
  @ApiPropertyOptional({ enum: PartyType })
  @IsOptional()
  @IsEnum(PartyType, { message: 'Loại đối tượng không hợp lệ' })
  type?: PartyType;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái đang dùng' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'isActive phải là true/false' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Tìm theo mã / tên / mã số thuế / email' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
