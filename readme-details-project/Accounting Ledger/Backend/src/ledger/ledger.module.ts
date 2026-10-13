import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Account } from '../accounts/entities/account.entity.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { AccountBalance } from './entities/account-balance.entity.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AccountBalance, Account, FiscalPeriod])],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
