import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { TaxCode } from './entities/tax-code.entity.js';
import { TaxCodesService } from './tax-codes.service.js';
import { TaxesController } from './taxes.controller.js';

/**
 * **Thuế** (mục 10.C.2) — danh mục mã thuế + giải thuế cho dòng chứng từ.
 *
 * Ranh giới trách nhiệm (theo quyết định #1 và #2):
 * - `TaxCodesService` **chỉ** cấp thông tin thuế (thuế suất + tài khoản 3331/1331).
 * - Tài khoản doanh thu/chi phí vẫn do `AccountDefaultsService` quyết định.
 * - Dòng thuế **không** được nhập tay vào bút toán; nó sinh ra khi `post` chứng từ,
 *   qua `JournalsService` — vẫn đúng một bộ máy ghi sổ.
 *
 * `TaxCodesService` được export để `SalesInvoicesModule` / `VendorBillsModule` áp thuế
 * khi lập và ghi sổ chứng từ, và `ReportsModule` đọc báo cáo GTGT.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TaxCode]), AccountsModule],
  controllers: [TaxesController],
  providers: [TaxCodesService],
  exports: [TaxCodesService],
})
export class TaxesModule {}
