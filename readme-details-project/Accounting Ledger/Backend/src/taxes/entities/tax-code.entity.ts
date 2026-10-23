import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import { TaxType } from '../../common/enums/tax-code.enum.js';

/**
 * Mã thuế (mục 10.C.2).
 *
 * Quyết định đã chốt: thuế là **lớp tính trên dòng chứng từ** — dòng thuế sinh tự
 * động khi ghi sổ, **không** nhập tay vào bút toán. Bảng này vì vậy chỉ cấp **thông
 * tin thuế** (thuế suất + tài khoản đích), còn tài khoản doanh thu/chi phí vẫn do
 * `AccountDefaultsService` quyết định (quyết định #1). Hai việc đó độc lập: đổi thuế
 * suất không được làm đổi tài khoản doanh thu.
 *
 * Vì sao là **bảng cấu hình** chứ không phải hằng số trong code: thuế suất GTGT của
 * Việt Nam đã thay đổi nhiều lần (10% → 8% → 10%…). Hardcode nghĩa là mỗi lần luật
 * đổi phải sửa code và deploy; ở đây chỉ cần thêm một dòng dữ liệu.
 *
 * Bất biến:
 * - `code` duy nhất.
 * - `rate` là **phần trăm** (10 = 10%), lưu `NUMERIC(9,4)` để chứa được cả thuế suất
 *   lẻ (vd 4.5%) mà không mất chính xác.
 * - Không xóa mã thuế đã dùng — chỉ `isActive = false` (xem `TaxCodesService.remove`).
 */
@Entity('tax_codes')
export class TaxCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mã thuế (vd: `VAT10`, `VAT8`, `KCT`) — duy nhất. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Loại thuế. Hiện chỉ có GTGT — enum để mở rộng mà không đổi lược đồ. */
  @Index()
  @Column({
    type: 'enum',
    enum: TaxType,
    enumName: 'tax_type_enum',
    default: TaxType.VAT,
  })
  type: TaxType;

  /** Thuế suất **phần trăm** (10.0000 = 10%). */
  @Column({ type: 'numeric', precision: 9, scale: 4, default: 0 })
  rate: string;

  /**
   * Tài khoản thuế **đầu ra** (bán hàng) — mặc định TK 3331.
   *
   * `NULL` ⇒ `TaxCodesService` rơi về tiền tố `3331` (lưới an toàn, cùng triết lý với
   * `AccountDefaultsService`). Khai tường minh khi doanh nghiệp tách chi tiết
   * (33311 thuế đầu ra của hàng hóa, 33312 của dịch vụ…).
   */
  @Column({ name: 'output_account_id', type: 'uuid', nullable: true })
  outputAccountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'output_account_id' })
  outputAccount: Account | null;

  /** Tài khoản thuế **đầu vào** (mua hàng) — mặc định TK 1331. */
  @Column({ name: 'input_account_id', type: 'uuid', nullable: true })
  inputAccountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'input_account_id' })
  inputAccount: Account | null;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
