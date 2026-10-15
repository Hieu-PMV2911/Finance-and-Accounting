import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaymentDirection } from '../../common/enums/payment-direction.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { PaymentStatus } from '../../common/enums/payment-status.enum.js';

export class QueryPaymentsDto {
  @ApiPropertyOptional({ enum: PaymentDirection })
  @IsOptional()
  @IsEnum(PaymentDirection, { message: 'Chiều phiếu không hợp lệ' })
  direction?: PaymentDirection;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus, { message: 'Trạng thái phiếu không hợp lệ' })
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  method?: PaymentMethod;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'partyId không hợp lệ' })
  partyId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số phiếu / diễn giải / số tham chiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
