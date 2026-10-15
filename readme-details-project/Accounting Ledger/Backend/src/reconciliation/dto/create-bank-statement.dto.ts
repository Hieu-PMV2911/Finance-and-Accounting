import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { MONEY_PATTERN } from '../../common/utils/money.util.js';

const MONEY_MESSAGE =
  'Số tiền phải là chuỗi số (tối đa 15 chữ số nguyên, tối đa 4 chữ số thập phân)';

/**
 * Nhập một **bảng sao kê ngân hàng** (mục 10.B).
 *
 * `content` là nội dung thô của file (CSV hoặc JSON). Parser **không** được gọi ở
 * đây — nó chạy trong job `import-statement` để không chặn request khi file dài.
 */
export class CreateBankStatementDto {
  @ApiProperty({ example: 'SK-VCB-2026-10', description: 'Mã bảng sao kê (duy nhất)' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code: string;

  @ApiProperty({ format: 'uuid', description: 'Tài khoản tiền (111/112) của sao kê' })
  @IsUUID('4', { message: 'accountId không hợp lệ' })
  accountId: string;

  @ApiProperty({ example: '2026-10-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'statementDate phải theo định dạng YYYY-MM-DD' })
  statementDate: string;

  @ApiPropertyOptional({ example: '100000000.0000' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  openingBalance?: string;

  @ApiPropertyOptional({ example: '135000000.0000' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: MONEY_MESSAGE })
  closingBalance?: string;

  @ApiPropertyOptional({ example: 'VCB-2026-10.csv', description: 'Tên file / id kết nối nguồn' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceRef?: string;

  @ApiProperty({
    description:
      'Nội dung thô của file sao kê (CSV hoặc JSON). Cột ngày hỗ trợ YYYY-MM-DD và DD/MM/YYYY; ' +
      'chiều tiền suy ra từ cột direction, cặp cột credit/debit, hoặc dấu của amount.',
    example: 'date,description,reference,bankRef,amount\n2026-10-05,Thu tien KH,PT-001,FT001,15000000\n',
  })
  @IsString()
  @MinLength(3, { message: 'Nội dung sao kê quá ngắn' })
  content: string;
}
