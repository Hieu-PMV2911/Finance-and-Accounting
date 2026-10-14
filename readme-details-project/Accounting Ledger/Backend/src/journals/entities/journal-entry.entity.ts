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

import { JournalStatus } from '../../common/enums/journal-status.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { FiscalPeriod } from '../../fiscal-periods/entities/fiscal-period.entity.js';
import type { JournalLine } from './journal-line.entity.js';

/**
 * Bút toán (journal entry) — chứng từ ghi sổ kế toán kép.
 *
 * Bất biến:
 * - Σ Nợ = Σ Có, và tổng phải > 0 (kiểm tra ở backend, không tin frontend).
 * - Bút toán đã `posted` là **bất biến** — không sửa, không xóa. Muốn sửa thì
 *   tạo **bút toán đảo** (`reverse`) và giữ nguyên lịch sử.
 * - `idempotencyKey` duy nhất (khi có) — chống ghi trùng do client retry.
 * - `entryNo` chỉ được cấp khi ghi sổ, duy nhất trên toàn hệ thống.
 * - `(sourceType, sourceId)` duy nhất khi `sourceId` khác NULL — **một chứng từ nguồn
 *   chỉ sinh một bút toán gốc** (mục 10.0). Lá chắn thứ hai ở tầng DB cho quy tắc
 *   mà service đã kiểm tra trước đó.
 */
@Entity('journal_entries')
@Index('journal_entries_source_uidx', ['sourceType', 'sourceId'], {
  unique: true,
  // Bút toán nhập tay (source_id NULL) không bị ràng buộc này.
  where: '"source_id" IS NOT NULL',
})
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Số hiệu chứng từ, cấp khi ghi sổ (vd: `JE-2026-01-0001`).
   * `NULL` khi còn là nháp.
   */
  @Index({ unique: true })
  @Column({ name: 'entry_no', type: 'varchar', length: 48, nullable: true })
  entryNo: string | null;

  /** Ngày hạch toán — quyết định bút toán thuộc kỳ kế toán nào. */
  @Index()
  @Column({ name: 'entry_date', type: 'date' })
  date: string;

  @Index()
  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @ManyToOne(() => FiscalPeriod, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'period_id' })
  period: FiscalPeriod;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  /** Số chứng từ gốc (hóa đơn, phiếu thu/chi…) — hiển thị, không kiểm soát trùng. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  /**
   * Loại **chứng từ nguồn** (mục 10.0). `manual` = nhập tay; mọi loại khác buộc
   * phải có `sourceId`.
   */
  @Column({
    name: 'source_type',
    type: 'enum',
    enum: SourceType,
    enumName: 'source_type_enum',
    default: SourceType.MANUAL,
  })
  sourceType: SourceType;

  /**
   * Id của chứng từ nguồn (hóa đơn / phiếu thu / dòng sao kê / sự kiện provider).
   * Cùng với `sourceType` tạo thành khóa truy vết ngược từ báo cáo về chứng từ gốc.
   */
  @Index()
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: JournalStatus,
    enumName: 'journal_status_enum',
    default: JournalStatus.DRAFT,
  })
  status: JournalStatus;

  @Column({
    name: 'total_debit',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  totalDebit: string;

  @Column({
    name: 'total_credit',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
  })
  totalCredit: string;

  /** Khóa chống ghi trùng; `NULL` cho phép nhiều bút toán không đặt khóa. */
  @Index({ unique: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  idempotencyKey: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  /** Nếu bút toán này là bút toán đảo → trỏ về bút toán gốc. */
  @Column({ name: 'reversal_of_entry_id', type: 'uuid', nullable: true })
  reversalOfEntryId: string | null;

  /** Nếu bút toán này đã bị đảo → trỏ về bút toán đảo. */
  @Column({ name: 'reversed_by_entry_id', type: 'uuid', nullable: true })
  reversedByEntryId: string | null;

  /**
   * Tham chiếu tới `JournalLine` bằng **tên entity dạng chuỗi** thay vì import
   * class: `JournalEntry` và `JournalLine` tham chiếu vòng qua nhau, mà
   * `emitDecoratorMetadata` lại sinh `design:type` tham chiếu class ngay lúc
   * nạp module → sẽ nổ `Cannot access 'X' before initialization` trên ESM.
   * Dùng chuỗi thì file này không cần import runtime `JournalLine` nữa, vòng
   * lặp bị phá hoàn toàn.
   */
  @OneToMany('JournalLine', (line: JournalLine) => line.entry, {
    cascade: ['insert'],
  })
  lines: JournalLine[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
