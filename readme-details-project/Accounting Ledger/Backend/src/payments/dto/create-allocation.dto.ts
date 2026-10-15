import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Matches } from 'class-validator';

import { AllocationTargetType } from '../../common/enums/allocation-target-type.enum.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân) — không dùng số thực để tránh sai số';

export class CreateAllocationDto {
  @ApiProperty({
    enum: AllocationTargetType,
    example: AllocationTargetType.SALES_INVOICE,
    description: 'Loại chứng từ đích (hóa đơn bán hoặc hóa đơn mua)',
  })
  @IsEnum(AllocationTargetType, { message: 'Loại chứng từ đích không hợp lệ' })
  targetType: AllocationTargetType;

  @ApiProperty({ format: 'uuid', description: 'Id chứng từ đích' })
  @IsUUID('4', { message: 'targetId không hợp lệ' })
  targetId: string;

  @ApiProperty({
    example: '30000000.0000',
    description: 'Số tiền phân bổ — không vượt quá số còn lại của cả hai bên',
  })
  @IsString()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  amount: string;
}
