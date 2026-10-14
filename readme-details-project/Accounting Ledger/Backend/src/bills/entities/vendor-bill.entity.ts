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
import { BillStatus } from '../../common/enums/bill-status.enum.js';

@Entity('vendor_bills')
export class VendorBill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'bill_no', type: 'varchar', length: 64 })
  billNo: string;

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
    enum: BillStatus,
    enumName: 'bill_status_enum',
    default: BillStatus.DRAFT,
  })
  status: BillStatus;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  subtotal: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  taxAmount: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  total: string;

  @Column({ name: 'payable_account_id', type: 'uuid', nullable: true })
  payableAccountId: string | null;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => VendorBillLine, (line) => line.bill, {
    cascade: true,
    eager: false,
  })
  lines: VendorBillLine[];
}

@Entity('vendor_bill_lines')
export class VendorBillLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'bill_id', type: 'uuid' })
  billId: string;

  @ManyToOne(() => VendorBill, (bill) => bill.lines, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bill_id' })
  bill: VendorBill;

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
