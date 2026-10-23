import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class QueryCompaniesDto {
  @ApiPropertyOptional({
    description: 'Bao gồm cả công ty đã ngừng sử dụng (mặc định: không)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeInactive phải là true/false' })
  includeInactive?: boolean;
}
