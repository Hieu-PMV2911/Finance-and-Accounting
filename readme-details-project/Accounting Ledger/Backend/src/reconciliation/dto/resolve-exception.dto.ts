import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { ReconciliationExceptionStatus } from '../../common/enums/reconciliation-exception.enum.js';

/**
 * Xử lý một **dòng lệch** (mục 10.B).
 *
 * Chỉ cho phép hai trạng thái kết thúc — `resolved` hoặc `ignored` — vì mở lại một
 * dòng đã xử lý sẽ làm mất ý nghĩa của "đã đối soát". Cần xử lý lại thì tạo dòng
 * lệch mới (khóa chống trùng đã tính tới việc này).
 *
 * Không có thao tác xoá: dòng lệch là **bằng chứng** đã có chênh lệch, xoá đi là
 * mất khả năng giải thích về sau.
 */
export class ResolveExceptionDto {
  @ApiProperty({
    enum: [ReconciliationExceptionStatus.RESOLVED, ReconciliationExceptionStatus.IGNORED],
    example: ReconciliationExceptionStatus.RESOLVED,
  })
  @IsEnum(ReconciliationExceptionStatus, { message: 'Trạng thái xử lý không hợp lệ' })
  status: ReconciliationExceptionStatus.RESOLVED | ReconciliationExceptionStatus.IGNORED;

  @ApiPropertyOptional({ example: 'Đã tạo bút toán phí ngân hàng ngày 12/10' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Ghi chú tối đa 1000 ký tự' })
  note?: string;
}
