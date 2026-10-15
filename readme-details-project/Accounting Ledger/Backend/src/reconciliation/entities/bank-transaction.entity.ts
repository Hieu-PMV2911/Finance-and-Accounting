import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  BankMatchStatus,
  BankTransactionDirection,
  BankTransactionSource,
} from '../../common/enums/bank-transaction.enum.js';

/**
 * **Giao dịch ngân hàng chuẩn hóa** (mục 10.B, quyết định #4).
 *
 * Đây là **mô hình duy nhất** cho mọi nguồn dữ liệu: file CSV/JSON, file Excel,
 * hay (sau này) kết nối API ngân hàng đều phải đổ về bảng này với cùng bộ trường.
 * Nhờ vậy logic khớp đối soát **không** có nhánh `if (nguồn là file)`, và thêm
 * nguồn thứ hai chỉ là thêm một `StatementSourceAdapter`.
 *
 * Chống trùng: `UNIQUE (account_id, bank_ref, amount, transaction_date)` khi có
 * `bank_ref`. Nhập lại cùng một file không nhân đôi số liệu — nhưng chỉ áp dụng
 * khi ngân hàng cung cấp mã tham chiếu (không có mã thì không có cơ sở kết luận
 * hai dòng là một, và **không được đoán**).
 */
@Entity('bank_transactions')
@Index('bank_transactions_statement_idx', ['statementId'])
@Index('bank_transactions_account_date_idx', ['accountId', 'transactionDate'])
@Index('bank_transactions_dedupe_idx', ['accountId', 'bankRef', 'amount', 'transactionDate'], {
  unique: true,
  where: '"bank_ref" IS NOT NULL',
})
export class BankTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'statement_id', type: 'uuid', nullable: true })
  statementId: string | null;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  /** Ngày giá trị (nếu sao kê có) — dùng cho khớp tầng 2 khi ngày hạch toán lệch. */
  @Column({ name: 'value_date', type: 'date', nullable: true })
  valueDate: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /** Số tham chiếu trên sao kê (cột `reference`/`diễn giải mã`). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  reference: string | null;

  /** Mã giao dịch của ngân hàng — khóa chống trùng tự nhiên. */
  @Column({ name: 'bank_ref', type: 'varchar', length: 200, nullable: true })
  bankRef: string | null;

  @Column({
    type: 'enum',
    enum: BankTransactionDirection,
    enumName: 'bank_transaction_direction_enum',
  })
  direction: BankTransactionDirection;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 16, default: 'VND' })
  currency: string;

  @Column({
    type: 'enum',
    enum: BankTransactionSource,
    enumName: 'bank_transaction_source_enum',
    default: BankTransactionSource.FILE,
  })
  source: BankTransactionSource;

  @Column({ name: 'source_ref', type: 'varchar', length: 200, nullable: true })
  sourceRef: string | null;

  /** Dòng gốc trong file (giữ nguyên để đối chiếu khi parser sai). */
  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, unknown> | null;

  @Index()
  @Column({
    type: 'enum',
    enum: BankMatchStatus,
    enumName: 'bank_match_status_enum',
    default: BankMatchStatus.UNMATCHED,
  })
  matchStatus: BankMatchStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
