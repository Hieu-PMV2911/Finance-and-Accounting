import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { BankStatementStatus } from '../../common/enums/bank-transaction.enum.js';

/** Lọc danh sách bảng sao kê (mục 10.B). */
export class QueryBankStatementsDto {
  @ApiPropertyOptional({ enum: BankStatementStatus })
  @IsOptional()
  @IsEnum(BankStatementStatus)
  status?: BankStatementStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã sao kê' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
