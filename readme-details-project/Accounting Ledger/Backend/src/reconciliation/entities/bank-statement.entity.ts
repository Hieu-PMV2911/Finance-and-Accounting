import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  BankStatementStatus,
  BankTransactionSource,
} from '../../common/enums/bank-transaction.enum.js';

/**
 * **Bảng sao kê ngân hàng** đã nhập (mục 10.B).
 *
 * Vai trò: là *phía bên ngoài* của phép đối soát. Mỗi bảng gắn với **một** tài
 * khoản tiền (111/112) và một ngày sao kê; các dòng chi tiết nằm ở
 * `bank_transactions`.
 *
 * Bất biến: sau khi `status = reconciled`, bảng là **bất biến** — không nhận thêm
 * dòng, không đổi khớp. Chốt rồi mà còn sửa được thì con số "đã đối soát" vô nghĩa.
 */
@Entity('bank_statements')
export class BankStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  /** Tài khoản tiền của doanh nghiệp mà sao kê này thuộc về (111/112). */
  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'statement_date', type: 'date' })
  statementDate: string;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 19, scale: 4, nullable: true })
  openingBalance: string | null;

  @Column({ name: 'closing_balance', type: 'numeric', precision: 19, scale: 4, nullable: true })
  closingBalance: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: BankStatementStatus,
    enumName: 'bank_statement_status_enum',
    default: BankStatementStatus.DRAFT,
  })
  status: BankStatementStatus;

  /** Nguồn dữ liệu — **chỉ để truy vết**, không để rẽ nhánh xử lý (quyết định #4). */
  @Column({
    type: 'enum',
    enum: BankTransactionSource,
    enumName: 'bank_transaction_source_enum',
    default: BankTransactionSource.FILE,
  })
  source: BankTransactionSource;

  /** Id file / id kết nối nguồn (nếu có). */
  @Column({ name: 'source_ref', type: 'varchar', length: 200, nullable: true })
  sourceRef: string | null;

  /**
   * Nội dung thô của file sao kê (CSV/JSON).
   *
   * Lưu ở đây thay vì nhét vào payload job để: (1) job chỉ cần mang `statementId`
   * nên Redis không phình, (2) còn nguyên dữ liệu gốc để đối chiếu khi parser sai.
   */
  @Column({ name: 'raw_content', type: 'text', nullable: true })
  rawContent: string | null;

  @Column({ name: 'line_count', type: 'int', default: 0 })
  lineCount: number;

  @Column({ name: 'imported_by', type: 'uuid', nullable: true })
  importedBy: string | null;

  @Column({ name: 'imported_at', type: 'timestamptz', nullable: true })
  importedAt: Date | null;

  @Column({ name: 'last_matched_at', type: 'timestamptz', nullable: true })
  lastMatchedAt: Date | null;

  @Column({ name: 'reconciled_by', type: 'uuid', nullable: true })
  reconciledBy: string | null;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
