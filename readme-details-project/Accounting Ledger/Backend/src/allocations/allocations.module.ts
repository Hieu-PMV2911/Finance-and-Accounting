import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AllocationsService } from './allocations.service.js';
import { Allocation } from './entities/allocation.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Allocation])],
  providers: [AllocationsService],
  exports: [AllocationsService],
})
export class AllocationsModule {}
