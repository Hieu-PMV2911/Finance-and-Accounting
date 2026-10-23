import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';

import { BillStatus } from '../common/enums/bill-status.enum.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { resolveRange } from '../ledger/ledger-aggregate.util.js';
import type { QueryReportDto } from './dto/query-report.dto.js';
import type {
  VatDocumentRow,
  VatSection,
  VatView,
} from './interfaces/vat-view.interface.js';

interface VatRow {
  document_id: string;
  document_no: string;
  date: string;
  party_id: string;
  party_code: string;
  party_name: string;
  party_tax_code: string | null;
  subtotal: string;
  tax_amount: string;
  total: string;
}

/** Nguồn dữ liệu của bảng kê thuế — tên bảng/cột lấy từ enum, không từ input. */
const VAT_SOURCES: Record<'output' | 'input', { table: string; codeColumn: string; status: string }> =
  {
    output: {
      table: 'sales_invoices',
      codeColumn: 'invoice_no',
      status: InvoiceStatus.POSTED,
    },
    input: {
      table: 'vendor_bills',
      codeColumn: 'bill_no',
      status: BillStatus.POSTED,
    },
  };

/**
 * Báo cáo **thuế GTGT đầu vào / đầu ra** theo kỳ (mục 10.C.2).
 *
 * Nguồn số liệu là các **chứng từ đã ghi sổ** (`status = 'posted'`), không phải
 * `journal_lines`: bảng kê thuế phải tra được ra từng hóa đơn (số, ngày, mã số thuế của
 * đối tượng) — những thứ bút toán không mang. Số tiền vẫn khớp sổ cái vì `post` dùng
 * **đúng** `tax_amount` của chứng từ để sinh dòng thuế (xem `SalesInvoicesService.post`).
 *
 * Chứng từ đã bị hủy (`voided`) tự rơi ra ngoài vì trạng thái không còn là `posted` —
 * đúng bằng hiệu ứng của bút toán đảo đã sinh khi hủy.
 *
 * `payable` **có thể âm**: đó là số thuế còn được khấu trừ, không phải số phải nộp.
 */
@Injectable()
export class VatReportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(FiscalPeriod)
    private readonly periods: Repository<FiscalPeriod>,
  ) {}

  async vatReport(query: QueryReportDto): Promise<VatView> {
    const range = await resolveRange(this.periods, query);

    const [output, input] = await Promise.all([
      this.section('output', range.fromDate, range.toDate),
      this.section('input', range.fromDate, range.toDate),
    ]);

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodId: range.period?.id ?? null,
      periodCode: range.period?.code ?? null,
      output,
      input,
      payable: moneyToString(
        toMoney(output.taxAmount).minus(toMoney(input.taxAmount)),
      ),
      documentCounts: {
        output: output.documents.length,
        input: input.documents.length,
      },
    };
  }

  // ---------------------------------------------------------------- helpers

  private async section(
    direction: 'output' | 'input',
    fromDate: string,
    toDate: string,
  ): Promise<VatSection> {
    const source = VAT_SOURCES[direction];

    const rows = await this.dataSource.query<VatRow[]>(
      `SELECT d.id AS document_id,
              d.${source.codeColumn} AS document_no,
              d.date,
              d.party_id,
              p.code AS party_code,
              p.name AS party_name,
              p.tax_code AS party_tax_code,
              d.subtotal,
              d.tax_amount,
              d.total
         FROM ${source.table} d
         JOIN parties p ON p.id = d.party_id
        WHERE d.status = $1
          AND d.date BETWEEN $2 AND $3
        ORDER BY d.date, d.${source.codeColumn}`,
      [source.status, fromDate, toDate],
    );

    const documents: VatDocumentRow[] = rows.map((row) => ({
      documentId: row.document_id,
      documentNo: row.document_no,
      date: row.date,
      partyId: row.party_id,
      partyCode: row.party_code,
      partyName: row.party_name,
      partyTaxCode: row.party_tax_code,
      subtotal: moneyToString(toMoney(row.subtotal)),
      taxAmount: moneyToString(toMoney(row.tax_amount)),
      total: moneyToString(toMoney(row.total)),
    }));

    const subtotal = sumOf(documents, (row) => row.subtotal);
    const taxAmount = sumOf(documents, (row) => row.taxAmount);
    const total = sumOf(documents, (row) => row.total);

    return {
      documents,
      subtotal: moneyToString(subtotal),
      taxAmount: moneyToString(taxAmount),
      total: moneyToString(total),
    };
  }
}

function sumOf(
  rows: readonly VatDocumentRow[],
  pick: (row: VatDocumentRow) => string,
): Decimal {
  return rows.reduce((acc, row) => acc.plus(toMoney(pick(row))), new Decimal(0));
}
