import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { BankStatementStatus } from '../enums/bank-statement-status.enum.js';
import {
  BankTransactionDirection,
  ReconciliationMatchStatus,
  ReconciliationMatchTargetType,
} from '../enums/bank-transaction.enum.js';

/** Lọc danh sách dòng sao kê. */
export class QueryBankTransactionsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'statementId không hợp lệ' })
  statementId?: string;

  @ApiPropertyOptional({ enum: ReconciliationMatchStatus })
  @IsOptional()
  @IsEnum(ReconciliationMatchStatus, { message: 'Trạng thái khớp không hợp lệ' })
  matchStatus?: ReconciliationMatchStatus;

  @ApiPropertyOptional({ enum: BankTransactionDirection })
  @IsOptional()
  @IsEnum(BankTransactionDirection, { message: 'Chiều tiền không hợp lệ' })
  direction?: BankTransactionDirection;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate phải theo YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate phải theo YYYY-MM-DD' })
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã ngân hàng / tham chiếu / diễn giải' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ default: 200, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** Lọc danh sách sao kê. */
export class QueryBankStatementsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId?: string;

  @ApiPropertyOptional({ enum: BankStatementStatus })
  @IsOptional()
  @IsEnum(BankStatementStatus, { message: 'Trạng thái sao kê không hợp lệ' })
  status?: BankStatementStatus;

  @ApiPropertyOptional({ default: 100, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Lọc danh sách dòng khớp. */
export class QueryMatchesDto {
  @ApiPropertyOptional({ enum: ReconciliationMatchTargetType })
  @IsOptional()
  @IsEnum(ReconciliationMatchTargetType, { message: 'Loại chứng từ không hợp lệ' })
  targetType?: ReconciliationMatchTargetType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'targetId không hợp lệ' })
  targetId?: string;

  @ApiPropertyOptional({ default: 200, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/**
 * Xác nhận một dòng khớp (người dùng bấm "Khớp" trên gợi ý, hoặc ghép tay).
 *
 * Bắt buộc ghi `note` khi ghép tay số tiền khác gợi ý — quyết định lệch khỏi
 * hệ thống phải luôn kèm lời giải thích để người sau tra được.
 */
export class ConfirmMatchDto {
  @ApiProperty({
    enum: ReconciliationMatchTargetType,
    description: 'Loại chứng từ nội bộ sẽ ghép với dòng sao kê',
  })
  @IsEnum(ReconciliationMatchTargetType, { message: 'Loại chứng từ không hợp lệ' })
  targetType: ReconciliationMatchTargetType;

  @ApiProperty({ format: 'uuid', description: 'Chứng từ nội bộ được ghép' })
  @IsUUID('4', { message: 'targetId không hợp lệ' })
  targetId: string;

  @ApiPropertyOptional({
    description:
      'Số tiền khớp. Bỏ trống ⇒ lấy toàn bộ số tiền dòng sao kê. Nhập khác gợi ý thì bắt buộc kèm note.',
  })
  @IsOptional()
  @Matches(/^\d{1,15}(\.\d{1,4})?$/, {
    message: 'amount phải là chuỗi số dương',
  })
  amount?: string;

  @ApiPropertyOptional({
    example: 'Đối chiếu với sao kê ngân hàng ngày 12/10',
    description: 'Ghi chú — bắt buộc khi số tiền khác số tiền dòng sao.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

/** Gỡ một dòng khớp đã xác nhận. */
export class UnmatchDto {
  @ApiPropertyOptional({
    example: 'Khách trả thiếu, tách phiếu thu khác',
    description: 'Lý do gỡ — bắt buộc để lại vết.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  reason?: string;
}

/** Tạo bút toán phí/lãi ngân hàng cho một dòng sao chưa khớp. */
export class CreateBankAdjustmentDto {
  @ApiProperty({
    description:
      'Diễn giải bút toán. Bỏ trống ⇒ lấy diễn giải dòng sao kê (nếu có).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Diễn giải tối đa 500 ký tự' })
  description?: string;
}
