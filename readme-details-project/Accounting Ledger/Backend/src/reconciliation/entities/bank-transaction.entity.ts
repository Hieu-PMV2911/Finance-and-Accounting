import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import {
  BankTransactionDirection,
  BankTransactionSource,
  ReconciliationMatchStatus,
} from '../enums/bank-transaction.enum.js';
import { BankStatement } from './bank-statement.entity.js';
import { ReconciliationMatch } from './reconciliation-match.entity.js';

/**
 * Dòng sao kê ngân hàng (mục 10.B — P2.2).
 *
 * **Mô hình chuẩn duy nhất** cho mọi dòng tiền: dù đến từ file CSV tải lên hay
 * từ API ngân hàng, đều phải về đúng bảng này rồi mới đi qua chung một pipeline
 * (normalize → chống trùng → khớp → đối soát). Nhờ vậy logic khớp không biết
 * dữ liệu đến từ đâu, và thêm nguồn thứ ba không cần viết nhánh mới.
 *
 * Chống trùng theo `UNIQUE(accountId, bankRef, amount, transactionDate)` —
 * cùng một dòng sao được nạp lại hai lần (file tải hai lần, hoặc file + API)
 * không tạo bản ghi thứ hai.
 */
@Entity('bank_transactions')
export class BankTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Sao kê chứa dòng này (nếu nạp theo lô). Dòng lẻ không thuộc lô nào vẫn
   * hợp lệ — API cho phép gửi một dòng mà không cần khai báo sao kê.
   */
  @Index()
  @Column({ name: 'statement_id', type: 'uuid', nullable: true })
  statementId: string | null;

  @ManyToOne(() => BankStatement, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'statement_id' })
  statement: BankStatement | null;

  /** Tài khoản tiền (111 tiền mặt / 112 tiền gửi ngân hàng). */
  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  /** Ngày giao dịch trên sao kê. */
  @Index()
  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  /** Ngày có hiệu lực (nếu ngân hàng tách riêng). */
  @Column({ name: 'value_date', type: 'date', nullable: true })
  valueDate: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /** Tham chiếu trên sao kê (số chứng từ, nội dung chuyển khoản…). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  reference: string | null;

  /** Mã giao dịch phía ngân hàng — chìa khóa khớp tầng 1. */
  @Column({ name: 'bank_ref', type: 'varchar', length: 128, nullable: true })
  bankRef: string | null;

  @Column({
    type: 'enum',
    enum: BankTransactionDirection,
    enumName: 'bank_transaction_direction_enum',
  })
  direction: BankTransactionDirection;

  /** Số tiền **luôn dương** — chiều nằm ở `direction`. */
  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  currency: string | null;

  @Column({
    type: 'enum',
    enum: BankTransactionSource,
    enumName: 'bank_transaction_source_enum',
  })
  source: BankTransactionSource;

  /** Id file / id kết nối API — truy ngược nguồn gốc dòng dữ liệu. */
  @Column({ name: 'source_ref', type: 'varchar', length: 255, nullable: true })
  sourceRef: string | null;

  /** Payload gốc từ nguồn (giữ nguyên để điều tra, không dùng để khớp). */
  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, unknown> | null;

  @Index()
  @Column({
    name: 'match_status',
    type: 'enum',
    enum: ReconciliationMatchStatus,
    enumName: 'reconciliation_match_status_enum',
    default: ReconciliationMatchStatus.UNMATCHED,
  })
  matchStatus: ReconciliationMatchStatus;

  /**
   * Bản ghi khớp đã xác nhận (1-1 theo thiết kế: một dòng sao chỉ khớp một
   * đối ứng đã chốt; quan hệ n-n lưu ở `reconciliation_matches`).
   */
  @OneToOne(
    () => ReconciliationMatch,
    (match) => match.transaction,
    { nullable: true },
  )
  match: ReconciliationMatch | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
