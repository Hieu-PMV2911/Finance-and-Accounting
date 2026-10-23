import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { Company } from './entities/company.entity.js';

/**
 * Công ty / pháp nhân (mục 10.C.1).
 *
 * `CompaniesService` được export để `CurrenciesModule` hỏi **đơn vị tiền hạch toán**
 * khi quy đổi ngoại tệ — không nơi nào hardcode `'VND'`.
 *
 * Việc cách ly dữ liệu theo công ty (`company_id` + bộ lọc toàn cục) thuộc 10.C.3
 * và sẽ bổ sung vào chính module này, không dựng lại từ đầu.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
