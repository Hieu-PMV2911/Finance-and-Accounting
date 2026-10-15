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

import { PaymentIntentStatus } from '../../common/enums/payment-intent-status.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { Party } from '../../parties/entities/party.entity.js';

/**
 * **Yêu cầu thanh toán** (mục 10.B) — vòng đời của một khoản tiền đi qua hệ thống
 * thanh toán bên ngoài.
 *
 * Vì sao tách khỏi `payments` (phiếu thu/chi của 10.A):
 * - `payments` là **chứng từ nội bộ** do người dùng lập, biết chắc đã thu/chi.
 * - `payment_intents` là **yêu cầu gửi ra provider** — có thể timeout, có thể bị
 *   từ chối, có thể có kết quả đến trễ. Trạng thái của nó **không** đồng nghĩa với
 *   "đã ghi sổ": chỉ khi có bằng chứng `captured` mới ghi sổ.
 *
 * Bất biến:
 * - `idempotencyKey` **duy nhất** — mọi lần retry/phục hồi dùng lại đúng khóa cũ,
 *   nên 2 request đồng thời cũng chỉ sinh 1 intent và (nhờ `source_id = intent.id`)
 *   chỉ 1 bút toán.
 * - Trạng thái `unknown` **không** phải thất bại: intent vẫn phải được tra cứu lại.
 * - Đã ghi sổ ⇒ `journalEntryId` được đặt; không bao giờ ghi sổ lần hai.
 */
@Entity('payment_intents')
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mã nghiệp vụ hiển thị cho người dùng (vd `PI-...`). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  /**
   * Khóa chống xử lý lặp do **bên gọi** cung cấp. Đây là trục xoay của yêu cầu
   * "phục hồi mà không tạo giao dịch trùng": phục hồi **không** sinh khóa mới.
   */
  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  /**
   * Ngày nghiệp vụ — dùng để tìm kỳ kế toán khi ghi sổ.
   *
   * Tách khỏi `createdAt` (thời điểm tạo bản ghi) vì tiền có thể được xác nhận thu
   * vào ngày khác; ghi sổ phải vào **đúng kỳ của ngày nghiệp vụ**.
   */
  @Index()
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 16, default: 'VND' })
  currency: string;

  /** Số ngoại tệ gốc (mục 10.C) — `null` khi tiền tệ trùng đồng tiền hạch toán. */
  @Column({ name: 'fx_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  fxAmount: string | null;

  /** Tỷ giá dùng khi ghi sổ (mục 10.C) — chốt tại thời điểm ghi sổ, không tính lại. */
  @Column({ name: 'fx_rate', type: 'numeric', precision: 19, scale: 8, nullable: true })
  fxRate: string | null;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method_enum' })
  method: PaymentMethod;

  @Index()
  @Column({ name: 'party_id', type: 'uuid', nullable: true })
  partyId: string | null;

  @ManyToOne(() => Party, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'party_id' })
  party: Party | null;

  /** Hóa đơn bán mà khoản thu này nhắm tới (tùy chọn — dùng để gợi ý phân bổ). */
  @Column({ name: 'sales_invoice_id', type: 'uuid', nullable: true })
  salesInvoiceId: string | null;

  /** Tài khoản tiền nhận/chi (111/112). Bỏ trống ⇒ suy ra theo `method`. */
  @Column({ name: 'cash_account_id', type: 'uuid', nullable: true })
  cashAccountId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: PaymentIntentStatus,
    enumName: 'payment_intent_status_enum',
    default: PaymentIntentStatus.INITIATED,
  })
  status: PaymentIntentStatus;

  /** Tham chiếu phía provider (mã giao dịch của họ). */
  @Column({ name: 'provider_ref', type: 'varchar', length: 200, nullable: true })
  providerRef: string | null;

  /** Id sự kiện webhook đã xác nhận kết quả (để truy vết ngược về webhook). */
  @Column({ name: 'provider_event_id', type: 'varchar', length: 200, nullable: true })
  providerEventId: string | null;

  /** Số lần đã tra cứu provider — dùng cho ngưỡng leo thang, **không** để suy diễn kết quả. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  /** Bút toán ghi sổ khi provider xác nhận đã thu tiền. Không bao giờ ghi lần hai. */
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
