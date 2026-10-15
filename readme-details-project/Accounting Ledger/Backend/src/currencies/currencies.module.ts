import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from '../accounts/accounts.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { CurrenciesController } from './currencies.controller.js';
import { CurrenciesService } from './currencies.service.js';
import { Currency } from './entities/currency.entity.js';
import { ExchangeRate } from './entities/exchange-rate.entity.js';
import { ExchangeRatesController } from './exchange-rates.controller.js';
import { ExchangeRatesService } from './exchange-rates.service.js';
import { FxDifferenceService } from './fx-difference.service.js';

/**
 * **Đa tiền tệ** (mục 10.C.1) — danh mục tiền, bảng tỷ giá, chênh lệch tỷ giá.
 *
 * Ba bất biến của quyết định #3 được thể hiện ở đây:
 *
 * 1. `debit`/`credit` **luôn** là tiền hạch toán ⇒ `ExchangeRatesService` chỉ *tra*
 *    tỷ giá; phép nhân nằm ở `JournalsService.normalizeLines` khi ghi sổ.
 * 2. Tiền hạch toán là **cấu hình được** ⇒ module phụ thuộc `CompaniesModule`,
 *    không hardcode `'VND'` ở bất kỳ đâu.
 * 3. Ngoại tệ lưu **trên cùng dòng** bút toán ⇒ không có bảng "bút toán ngoại tệ"
 *    riêng, nên mọi báo cáo hiện có không phải sửa.
 *
 * Quan hệ module **một chiều**: `JournalsModule` import `CurrenciesModule` (để quy
 * đổi khi ghi sổ), còn `FxDifferenceService` ở đây **không** inject `JournalsService`
 * — nó chỉ *dựng* DTO, việc ghi sổ do nơi gọi (`JournalsController`) thực hiện qua
 * đúng một bộ máy ghi sổ (quyết định #1). Nhờ vậy không có phụ thuộc vòng.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Currency, ExchangeRate]),
    CompaniesModule,
    AccountsModule,
    PartiesModule,
  ],
  controllers: [CurrenciesController, ExchangeRatesController],
  providers: [CurrenciesService, ExchangeRatesService, FxDifferenceService],
  exports: [CurrenciesService, ExchangeRatesService, FxDifferenceService],
})
export class CurrenciesModule {}
