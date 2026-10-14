import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * Yêu cầu job **chốt số dư** một kỳ (mục 9 — "chốt số dư").
 *
 * `repair = true` sẽ **ghi lại** `account_balances` theo số liệu tái lập từ
 * `journal_lines`. Mặc định `false` (chỉ đối chiếu + báo cáo) vì việc sửa dữ
 * liệu số dư là thao tác nhạy cảm, phải do người có trách nhiệm bấm.
 */
export class BalanceSnapshotDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Bỏ trống = dùng kỳ đang mở chứa hôm nay',
  })
  @IsOptional()
  @IsUUID('4', { message: 'periodId không hợp lệ' })
  periodId?: string;

  @ApiPropertyOptional({ default: false, description: 'Ghi lại số dư khi phát hiện lệch' })
  @IsOptional()
  @IsBoolean()
  repair?: boolean;
}
