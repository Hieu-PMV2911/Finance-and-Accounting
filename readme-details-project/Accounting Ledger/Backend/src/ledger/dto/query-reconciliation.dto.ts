import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Đối chiếu số dư đã lưu của một kỳ với số dư tái lập từ bút toán. */
export class QueryReconciliationDto {
  @ApiProperty({ format: 'uuid', description: 'Kỳ kế toán cần đối chiếu' })
  @IsUUID('4', { message: 'periodId không hợp lệ' })
  periodId: string;
}
