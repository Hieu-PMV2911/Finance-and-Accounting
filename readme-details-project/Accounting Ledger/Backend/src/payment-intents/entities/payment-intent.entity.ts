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

import { PaymentDirection } from '../../common/enums/payment-direction.enum.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { Party } from '../../parties/entities/party.entity.js';
import { PaymentIntentStatus } from '../enums/payment-intent-status.enum.js';

/**
 * Ý định thanh toán (mục 10.B — P2.1).
 *
 * Vì sao tách khỏi `payments` (phiếu thu/chi): phiếu là **chứng từ kế toán do ta
 * lập**, còn intent là **giao dịch với nhà cung cấp thanh toán** — có vòng đời
 * riêng (giữ tiền, thu tiền, về tài khoản, hoàn tiền) và có thể tồn tại ở trạng
 * thái "chưa biết kết quả" mà sổ kế toán không được phép ghi.
 *
 * Bất biến:
 * - `idempotencyKey` **duy nhất** — gửi lại không tạo giao dịch thứ hai ở nhà
 *   cung cấp, cũng không tạo intent thứ hai.
 * - Chỉ `captured`/`settled` mới có `journalEntryId`; ghi sổ lặp là **no-op**.
 * - Trạng thái cuối **không bị ghi đè** bởi kết quả đến trễ — thay vào đó sinh
 *   `reconciliation_exceptions` để con người xử lý.
 */
@Entity('payment_intents')
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Số tham chiếu nội bộ (duy nhất) — dùng để hiển thị và đối chiếu. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  /** Khóa chống trùng của **nhà cung cấp** — gửi lại trả về giao dịch cũ. */
  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  /** `receipt` = khách trả tiền; `payment` = ta trả nhà cung cấp. */
  @Column({
    type: 'enum',
    enum: PaymentDirection,
    enumName: 'payment_direction_enum',
  })
  direction: PaymentDirection;

  @Index()
  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @ManyToOne(() => Party, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  /** Hóa đơn bán được thanh toán (tùy chọn) — không bắt buộc để tạo intent. */
  @Index()
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  currency: string | null;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method_enum' })
  method: PaymentMethod;

  /** Tài khoản tiền; bỏ trống ⇒ suy ra theo phương thức khi ghi sổ. */
  @Column({ name: 'cash_account_id', type: 'uuid', nullable: true })
  cashAccountId: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reference: string | null;

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

  /** Tên nhà cung cấp đã xử lý giao dịch (vd `simulator`). */
  @Column({ type: 'varchar', length: 64 })
  provider: string;

  /** Mã giao dịch phía nhà cung cấp. */
  @Column({ name: 'provider_ref', type: 'varchar', length: 128, nullable: true })
  providerRef: string | null;

  /** Trạng thái thô của nhà cung cấp (để đọc lại khi cần điều tra). */
  @Column({
    name: 'provider_status',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  providerStatus: string | null;

  /** Số lần đã tra cứu nhà cung cấp (không tính lần tạo). */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  /**
   * Đã leo thang lần nào chưa — có rồi thì **ngừng** tra cứu tự động.
   * Lý do: gọi mãi một provider đang sự cố chỉ làm tăng tải, còn kết quả thật
   * phải do con người xác minh (ngoại lệ đang mở).
   */
  @Column({
    name: 'escalation_notified_at',
    type: 'timestamptz',
    nullable: true,
  })
  escalationNotifiedAt: Date | null;

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
