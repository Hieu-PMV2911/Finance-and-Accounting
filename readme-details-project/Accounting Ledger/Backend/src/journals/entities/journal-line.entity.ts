import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import { Party } from '../../parties/entities/party.entity.js';
import { JournalEntry } from './journal-entry.entity.js';

/**
 * Một dòng định khoản (Nợ hoặc Có) của bút toán.
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

  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Index()
  @Column({ name: 'party_id', type: 'uuid', nullable: true })
  partyId: string | null;

  @ManyToOne(() => Party, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'party_id' })
  party: Party | null;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  debit: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  credit: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
