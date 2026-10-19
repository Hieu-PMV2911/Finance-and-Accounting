import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import { BankStatementStatus } from '../enums/bank-statement-status.enum.js';
import { BankTransaction } from './bank-transaction.entity.js';

/**
 * Một kỳ sao kê ngân hàng (mục 10.B — P2.2).
 *
 * Nhóm các dòng `bank_transactions` theo kỳ để đối chiếu **số dư đầu/cuối**:
 * số dư cuối phải bằng số dư đầu + Σ vào − Σ ra. Không có ràng buộc này thì
 * "đối soát xong" không có nghĩa gì — có thể đối soát một sao thiếu dòng.
 *
 * Chốt (`reconciled`) là bất biến: mọi dòng bên trong phải đã khớp hết trước
 * khi được chốt.
 */
@Entity('bank_statements')
export class BankStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Số sao kê (duy nhất) — vd `ST-112-202610`. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  /** Tài khoản tiền (111/112) mà sao kê này áp cho. */
  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  /** Ngày chốt sao kê. */
  @Index()
  @Column({ name: 'statement_date', type: 'date' })
  statementDate: string;

  @Column({
    name: 'opening_balance',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  openingBalance: string;

  @Column({
    name: 'closing_balance',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  closingBalance: string;

  @Index()
  @Column({
    type: 'enum',
    enum: BankStatementStatus,
    enumName: 'bank_statement_status_enum',
    default: BankStatementStatus.IMPORTED,
  })
  status: BankStatementStatus;

  /** Nguồn nạp (file / API) — truy ngược toàn lô. */
  @Column({ name: 'source_ref', type: 'varchar', length: 255, nullable: true })
  sourceRef: string | null;

  @OneToMany(() => BankTransaction, (transaction) => transaction.statement)
  transactions: BankTransaction[];

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
