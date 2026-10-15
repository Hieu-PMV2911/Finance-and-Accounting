import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Currency } from './currency.entity.js';

/**
 * Bảng tỷ giá **nhập tay** (mục 10.C.1).
 *
 * Quyết định đã chốt: *"Nguồn tỷ giá: bảng nhập tay (`POST /api/exchange-rates`) +
 * seed theo ngày. Tự động lấy tỷ giá là hạng mục tùy chọn về sau."* Vì vậy cột
 * `source` tồn tại ngay từ đầu: nó là chỗ để sau này ghi `'manual'` / `'vietcombank'`
 * mà **không** phải đổi lược đồ khi tích hợp nhà cung cấp tỷ giá.
 *
 * Ý nghĩa của `rate`: **1 đơn vị `currencyCode` = `rate` đơn vị tiền hạch toán**.
 * Đây là chiều duy nhất được dùng trong hệ thống; đừng lưu chiều ngược lại để tránh
 * hai quy ước cùng tồn tại (`invertRate()` có sẵn nếu cần chiều ngược khi hiển thị).
 *
 * Bất biến:
 * - `UNIQUE(currency_code, rate_date)` — mỗi cặp (tiền, ngày) chỉ có **một** tỷ giá.
 *   Ghi lại cùng ngày là **cập nhật**, không phải thêm dòng mới; nhờ vậy tra cứu
 *   "tỷ giá của ngày X" luôn xác định, không phụ thuộc thứ tự chèn.
 * - Không sửa tỷ giá đã dùng để ghi sổ (bút toán đã lưu `fx_rate` trên dòng, nên
 *   sửa bảng này **không** làm sai số liệu cũ — đây là lý do `fx_rate` được sao lại
 *   vào dòng thay vì chỉ tham chiếu).
 */
@Entity('exchange_rates')
@Unique('exchange_rates_currency_date_uidx', ['currencyCode', 'rateDate'])
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode: string;

  @ManyToOne(() => Currency, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_code' })
  currency: Currency;

  @Index()
  @Column({ name: 'rate_date', type: 'date' })
  rateDate: string;

  /** 1 đơn vị `currencyCode` = `rate` đơn vị tiền hạch toán. */
  @Column({ type: 'numeric', precision: 19, scale: 8 })
  rate: string;

  /** Nguồn tỷ giá (`manual` hôm nay; tên nhà cung cấp nếu tích hợp sau này). */
  @Column({ type: 'varchar', length: 64, default: 'manual' })
  source: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
