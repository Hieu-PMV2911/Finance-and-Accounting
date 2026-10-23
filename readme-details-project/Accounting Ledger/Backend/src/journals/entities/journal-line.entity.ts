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

  /**
   * **Ngoại tệ** của dòng (mục 10.C.1, quyết định #3).
   *
   * `debit`/`credit` **luôn** là tiền hạch toán (`companies.base_currency`); ngoại tệ
   * nằm ở ba cột dưới đây **trên cùng dòng**. Nhờ vậy Σ Nợ = Σ Có không đổi và mọi
   * báo cáo/trial balance hiện có **không phải sửa** — chúng vốn chỉ đọc `debit`/`credit`.
   *
   * `NULL` ở cả ba cột = dòng tiền hạch toán thuần (trường hợp phổ biến nhất). Cố ý
   * **không** lưu `currency = 'VND'` cho dòng nội tệ: một dòng nội tệ và một dòng ngoại
   * tệ có tỷ giá 1 là hai thứ khác nhau về mặt truy vết, và `NULL` diễn đạt đúng hơn.
   */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  /** Số tiền **ngoại tệ** (dương) — `debit`/`credit` = `fx_amount × fx_rate`. */
  @Column({
    name: 'fx_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    nullable: true,
  })
  fxAmount: string | null;

  /**
   * Tỷ giá đã dùng: 1 đơn vị `currency` = `fx_rate` đơn vị tiền hạch toán.
   *
   * Vì sao **sao lại** tỷ giá vào dòng thay vì chỉ tham chiếu `exchange_rates`:
   * bút toán đã ghi sổ là bất biến, nên sửa/xóa bảng tỷ giá **không được** làm thay
   * đổi số liệu cũ. Lưu tại chỗ cũng cho phép tái lập phép quy đổi khi kiểm toán.
   */
  @Column({
    name: 'fx_rate',
    type: 'numeric',
    precision: 19,
    scale: 8,
    nullable: true,
  })
  fxRate: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
