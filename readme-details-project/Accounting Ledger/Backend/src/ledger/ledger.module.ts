import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Account } from '../accounts/entities/account.entity.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { JournalLine } from '../journals/entities/journal-line.entity.js';
import { AccountBalance } from './entities/account-balance.entity.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerQueryService } from './ledger-query.service.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountBalance,
      Account,
      FiscalPeriod,
      JournalLine,
    ]),
  ],
  controllers: [LedgerController],
  providers: [LedgerService, LedgerQueryService],
  exports: [LedgerService, LedgerQueryService],
})
export class LedgerModule {}
