import type { AuditLog } from '../entities/audit-log.entity.js';

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
  /** Chứng từ nguồn (số hóa đơn / phiếu thu-chi) để truy ngược ra giấy tờ gốc. */
  sourceDocument: string | null;
  /** Vết kiểm toán của bút toán này, mới nhất trước. */
  history: AuditLog[];
}
