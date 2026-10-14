import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { QueryGeneralLedgerDto } from './dto/query-general-ledger.dto.js';
import { QueryReconciliationDto } from './dto/query-reconciliation.dto.js';
import { QuerySubLedgerDto } from './dto/query-sub-ledger.dto.js';
import { QueryTrialBalanceDto } from './dto/query-trial-balance.dto.js';
import { LedgerQueryService } from './ledger-query.service.js';

@ApiTags('Ledger')
@ApiBearerAuth()
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerQuery: LedgerQueryService) {}

  @Get('general-ledger')
  @ApiOperation({
    summary: 'Sổ cái chi tiết theo tài khoản',
    description:
      'Số dư đầu kỳ → từng dòng phát sinh (kèm số dư lũy kế) → số dư cuối kỳ. ' +
      'Nhận periodId hoặc fromDate + toDate.',
  })
  @ApiOkResponse({ description: 'Sổ cái chi tiết của tài khoản' })
  generalLedger(@Query() query: QueryGeneralLedgerDto) {
    return this.ledgerQuery.generalLedger(query);
  }

  @Get('sub-ledger')
  @ApiOperation({
    summary: 'Sổ cái phụ theo đối tượng (mục 10.0)',
    description:
      'Công nợ của MỘT khách hàng / nhà cung cấp: số dư đầu kỳ → từng phát sinh ' +
      '(kèm số dư lũy kế) → số dư cuối kỳ. Bắt buộc partyId; phạm vi theo periodId ' +
      'hoặc fromDate + toDate; có thể giới hạn thêm một tài khoản công nợ.',
  })
  @ApiOkResponse({ description: 'Sổ cái phụ của đối tượng' })
  subLedger(@Query() query: QuerySubLedgerDto) {
    return this.ledgerQuery.subLedger(query);
  }

  @Get('trial-balance')
  @ApiOperation({
    summary: 'Bảng cân đối số phát sinh',
    description:
      'Dư đầu kỳ / phát sinh / dư cuối kỳ của mọi tài khoản có số dư, kèm dòng tổng ' +
      'và cờ balanced (Σ dư cuối Nợ = Σ dư cuối Có).',
  })
  @ApiOkResponse({ description: 'Bảng cân đối số phát sinh' })
  trialBalance(@Query() query: QueryTrialBalanceDto) {
    return this.ledgerQuery.trialBalance(query);
  }

  @Get('reconciliation')
  @ApiOperation({
    summary: 'Đối chiếu số dư với bút toán',
    description:
      'Tái lập số dư từ journal_lines rồi so với account_balances của kỳ. ' +
      'consistent = false nghĩa là số dư đã lưu bị lệch khỏi bút toán.',
  })
  @ApiOkResponse({ description: 'Kết quả đối chiếu số dư' })
  reconciliation(@Query() query: QueryReconciliationDto) {
    return this.ledgerQuery.reconcile(query);
  }
}
