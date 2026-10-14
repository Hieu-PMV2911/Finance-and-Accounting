import type { SourceType } from '../../common/enums/source-type.enum.js';
import type { AuditLog } from '../entities/audit-log.entity.js';

/** Chứng từ nguồn có cấu trúc (mục 10.0). */
export interface JournalSource {
  type: SourceType;
  /** Id chứng từ nguồn — mở ra được hóa đơn / phiếu thu / dòng sao kê tương ứng. */
  id: string;
}

/** Một dòng định khoản trong kết quả truy vết. */
export interface TraceJournalLine {
  lineNo: number;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  description: string | null;
}

/**
 * Truy vết một bút toán (mục 8): **báo cáo → bút toán → chứng từ nguồn**.
 *
 * Từ một bút toán bất kỳ (thường là con số trên báo cáo), trả về toàn bộ dòng
 * định khoản, kỳ kế toán, **số chứng từ gốc** và **vết kiểm toán** của bút toán
 * đó — đủ để trả lời "con số này từ đâu ra và ai đã làm".
 */
export interface JournalTraceability {
  entity: 'journal_entries';
  entityId: string;
  journal: {
    id: string;
    entryNo: string | null;
    date: string;
    status: string;
    description: string;
    periodId: string;
    periodCode: string | null;
    totalDebit: string;
    totalCredit: string;
    createdBy: string;
    approvedBy: string | null;
    approvedAt: string | null;
    postedBy: string | null;
    postedAt: string | null;
    reversalOfEntryId: string | null;
    reversedByEntryId: string | null;
  };
  lines: TraceJournalLine[];
  /** Số chứng từ nguồn (hóa đơn / phiếu thu-chi) — chuỗi hiển thị cho người dùng. */
  sourceDocument: string | null;
  /**
   * Chứng từ nguồn **có cấu trúc** (mục 10.0): `null` với bút toán nhập tay, ngược
   * lại là `{ type, id }` để mở thẳng chứng từ gốc.
   */
  source: JournalSource | null;
  /** Vết kiểm toán của bút toán này, mới nhất trước. */
  history: AuditLog[];
}
