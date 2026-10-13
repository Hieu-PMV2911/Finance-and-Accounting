import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JournalEntry } from '../journals/entities/journal-entry.entity.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { FiscalPeriod } from './entities/fiscal-period.entity.js';
import { FiscalPeriodsController } from './fiscal-periods.controller.js';
import { FiscalPeriodsService } from './fiscal-periods.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FiscalPeriod, JournalEntry]),
    LedgerModule,
  ],
  controllers: [FiscalPeriodsController],
  providers: [FiscalPeriodsService],
  exports: [FiscalPeriodsService],
})
export class FiscalPeriodsModule {}
