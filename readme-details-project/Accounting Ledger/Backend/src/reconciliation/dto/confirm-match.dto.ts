import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';

import { ReconciliationTargetType } from '../../common/enums/reconciliation-target-type.enum.js';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

/**
 * Xác nhận khớp **thủ công** một dòng sao kê với chứng từ nội bộ (mục 10.B).
 *
 * Bỏ trống `amount` ⇒ lấy đúng số tiền của dòng sao kê. Khai `amount` nhỏ hơn ⇒
 * biểu diễn **khớp một phần** (một khoản thu gộp khớp nhiều hóa đơn, hoặc ngân
 * hàng tách một khoản thành nhiều dòng).
 */
export class ConfirmMatchDto {
  @ApiProperty({ format: 'uuid', description: 'Dòng sao kê (bank_transactions.id)' })
  @IsUUID('4', { message: 'statementLineId không hợp lệ' })
  statementLineId: string;

  @ApiProperty({ enum: ReconciliationTargetType })
  @IsEnum(ReconciliationTargetType, { message: 'Loại chứng từ đích không hợp lệ' })
  targetType: ReconciliationTargetType;

  @ApiProperty({ format: 'uuid', description: 'Id chứng từ nội bộ (phiếu thu/chi hoặc bút toán)' })
  @IsUUID('4', { message: 'targetId không hợp lệ' })
  targetId: string;

  @ApiPropertyOptional({ example: '15000000.0000', description: 'Số tiền khớp (mặc định bằng số tiền dòng sao kê)' })
  @IsOptional()
  @Matches(MONEY_PATTERN, {
    message: 'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân)',
  })
  amount?: string;
}
