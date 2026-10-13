import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JournalsModule } from '../journals/journals.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditSubscriber } from './audit.subscriber.js';
import { AuditLog } from './entities/audit-log.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), JournalsModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    // Provider này tự đăng ký vào `dataSource.subscribers` khi được khởi tạo.
    AuditSubscriber,
  ],
  exports: [AuditService],
})
export class AuditModule {}
