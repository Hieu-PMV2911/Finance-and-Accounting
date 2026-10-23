import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Công ty / pháp nhân kế toán (mục 10.C).
 *
 * Ở giai đoạn 10.C.1 bảng này tồn tại vì **một lý do duy nhất**: quyết định #3 chốt
 * rằng đơn vị tiền hạch toán là **cấu hình được**, nên mọi phép quy đổi ngoại tệ cần
 * một đích đến xác định. `baseCurrency` chính là đích đó.
 *
 * Việc **cách ly dữ liệu theo công ty** (thêm `company_id` vào mọi bảng, lọc theo
 * công ty đang chọn) thuộc 10.C.3 và sẽ làm bằng migration 3 bước riêng — cố ý
 * **không** trộn vào đây để hai thay đổi lớn không đổ lỗi lẫn nhau khi kiểm thử.
 *
 * Bất biến:
 * - `code` duy nhất.
 * - Đúng **một** công ty có `isDefault = true`; không thể xóa công ty mặc định.
 * - `baseCurrency` là mã tiền 3 ký tự (ISO 4217), mặc định `VND`.
 */
@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mã công ty (vd: `MAIN`, `CN-HN`) — duy nhất. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Mã số thuế của pháp nhân. */
  @Column({ name: 'tax_code', type: 'varchar', length: 32, nullable: true })
  taxCode: string | null;

  /**
   * **Đơn vị tiền hạch toán** (quyết định #3). Mọi giá trị `debit`/`credit` trong
   * `journal_lines` đều tính bằng đơn vị này; ngoại tệ nằm ở `currency`/`fx_amount`/`fx_rate`.
   */
  @Column({ name: 'base_currency', type: 'varchar', length: 3, default: 'VND' })
  baseCurrency: string;

  /** Công ty mặc định — nơi mọi truy vấn chưa chọn công ty sẽ trỏ về (chuẩn bị cho 10.C.3). */
  @Index()
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

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
