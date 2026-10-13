import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import { JournalEntry } from './journal-entry.entity.js';

/**
 * Một dòng định khoản (Nợ **hoặc** Có) của bút toán.
 *
 * Mỗi dòng chỉ được ghi vào một bên: `debit > 0` XOR `credit > 0`.
 * Chỉ được trỏ tới tài khoản lá đang hoạt động (`isPostable = true`).
 */
@Entity('journal_lines')
export class JournalLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'entry_id', type: 'uuid' })
  entryId: string;

  @ManyToOne(() => JournalEntry, (entry) => entry.lines, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'entry_id' })
  entry: JournalEntry;

  /** Thứ tự dòng trong bút toán (bắt đầu từ 1). */
  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  debit: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  credit: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
