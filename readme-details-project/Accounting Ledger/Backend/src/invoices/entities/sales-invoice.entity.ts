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

import { Party } from '../../parties/entities/party.entity.js';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum.js';

@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'invoice_no', type: 'varchar', length: 64 })
  invoiceNo: string;

  @Index()
  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @ManyToOne(() => Party, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  currency: string | null;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    enumName: 'invoice_status_enum',
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  subtotal: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  taxAmount: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  total: string;

  @Column({ name: 'receivable_account_id', type: 'uuid', nullable: true })
  receivableAccountId: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  /**
   * Bút toán **đảo** sinh ra khi hủy hóa đơn đã ghi sổ.
   * Bút toán gốc (`journalEntryId`) không bao giờ bị sửa/xóa — bất biến số 2.
   */
  @Column({ name: 'reversal_journal_entry_id', type: 'uuid', nullable: true })
  reversalJournalEntryId: string | null;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  /** Lý do hủy — bắt buộc, để vết kiểm toán giải thích được vì sao chứng từ biến mất. */
  @Column({ name: 'void_reason', type: 'varchar', length: 500, nullable: true })
  voidReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SalesInvoiceLine, (line) => line.invoice, {
    cascade: true,
    eager: false,
  })
  lines: SalesInvoiceLine[];
}

@Entity('sales_invoice_lines')
export class SalesInvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => SalesInvoice, (invoice) => invoice.lines, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  quantity: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  unitPrice: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  amount: string;
}
