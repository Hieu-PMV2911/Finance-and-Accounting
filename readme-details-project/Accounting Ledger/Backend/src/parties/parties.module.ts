import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Party } from './entities/party.entity.js';
import { PartiesController } from './parties.controller.js';
import { PartiesService } from './parties.service.js';

/**
 * Mục 10.0 — danh mục đối tượng (khách hàng / nhà cung cấp).
 *
 * `PartiesService` được export để `JournalsModule` (kiểm tra `partyId` trên dòng
 * định khoản) và `LedgerModule` (sổ cái phụ theo đối tượng) dùng lại.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Party])],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
