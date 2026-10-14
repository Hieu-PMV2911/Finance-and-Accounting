import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { JournalEntry } from './entities/journal-entry.entity.js';
import { JournalLine } from './entities/journal-line.entity.js';
import { JournalsController } from './journals.controller.js';
import { JournalsService } from './journals.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([JournalEntry, JournalLine]),
    AccountsModule,
    FiscalPeriodsModule,
    LedgerModule,
    // Mục 10.0 — để kiểm tra `partyId` trên dòng định khoản (sổ cái phụ).
    PartiesModule,
  ],
  controllers: [JournalsController],
  providers: [JournalsService],
  exports: [JournalsService],
})
export class JournalsModule {}
