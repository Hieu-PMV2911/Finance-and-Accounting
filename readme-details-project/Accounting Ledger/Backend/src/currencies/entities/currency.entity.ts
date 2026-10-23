import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Danh mục tiền tệ (mục 10.C.1).
 *
 * Vì sao `code` là **khóa chính tự nhiên** chứ không phải một `uuid` sinh tự động:
 * mã tiền ISO 4217 (`VND`, `USD`, `EUR`) đã là định danh duy nhất, ngắn và bất biến.
 * Dùng nó làm khóa chính cho phép `exchange_rates.currency_code` trở thành **khóa
 * ngoại thật** — DB tự chặn tỷ giá của một loại tiền không tồn tại, điều mà một
 * `uuid` trỏ tới bảng khác sẽ không bảo đảm được nếu thiếu kiểm tra ở tầng ứng dụng.
 *
 * `decimals` là số chữ số thập phân của **ngoại tệ** (VND = 0, USD = 2, JPY = 0) —
 * dùng để hiển thị và để làm tròn `fx_amount` cho đúng tập quán, **không** ảnh hưởng
 * tới `debit`/`credit` (luôn 4 chữ số theo cột tiền hạch toán).
 */
@Entity('currencies')
export class Currency {
  /** Mã ISO 4217 — 3 chữ cái in hoa. */
  @PrimaryColumn({ type: 'varchar', length: 3 })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** Số chữ số thập phân của ngoại tệ (VND: 0, USD: 2). */
  @Column({ type: 'int', default: 2 })
  decimals: number;

  /**
   * Là đơn vị tiền hạch toán?
   *
   * Chỉ để **hiển thị và kiểm tra chéo**; nguồn sự thật của tiền hạch toán vẫn là
   * `companies.base_currency`. Hai nơi có thể lệch nhau nếu người dùng đổi
   * `baseCurrency` mà quên cập nhật cờ này, nên `CurrenciesService` giữ chúng đồng bộ
   * mỗi khi đọc.
   */
  @Index()
  @Column({ name: 'is_base', type: 'boolean', default: false })
  isBase: boolean;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
