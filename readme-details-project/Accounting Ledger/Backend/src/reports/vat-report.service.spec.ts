import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { BillStatus } from '../common/enums/bill-status.enum.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import type { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { VatReportService } from './vat-report.service.js';

/**
 * Mục 10.C.2 — bảng kê thuế GTGT đầu vào / đầu ra.
 *
 * Bất biến đáng khoá: `payable = thuế đầu ra − thuế đầu vào`, và số âm **không** bị cắt
 * về 0 (âm nghĩa là còn được khấu trừ — cắt đi sẽ giấu mất khoản được khấu trừ). Ngoài
 * ra, chứng từ đã hủy phải **không** xuất hiện: nguồn số liệu chỉ lấy `status = 'posted'`.
 */
const POSTED = 'posted';

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

function row(overrides: Partial<VatRow> & { document_id: string }): VatRow {
  return {
    document_no: `DOC-${overrides.document_id}`,
    date: '2026-03-01',
    party_id: 'party-1',
    party_code: 'KH001',
    party_name: 'Đối tượng A',
    party_tax_code: '0100000000',
    subtotal: '1000000',
    tax_amount: '100000',
    total: '1100000',
    ...overrides,
  };
}

/** `DataSource` giả: trả dữ liệu theo bảng (sales_invoices vs vendor_bills) và ghi lại tham số. */
function createService(byTable: {
  sales_invoices?: VatRow[];
  vendor_bills?: VatRow[];
}): { service: VatReportService; calls: { sql: string; params: unknown[] }[] } {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('FROM sales_invoices')) return byTable.sales_invoices ?? [];
    if (sql.includes('FROM vendor_bills')) return byTable.vendor_bills ?? [];
    return [];
  });

  const periods = {
    findOne: vi.fn(async () => null),
  } as unknown as Repository<FiscalPeriod>;

  return {
    service: new VatReportService({ query } as unknown as DataSource, periods),
    calls,
  };
}

describe('VatReportService — bảng kê thuế GTGT', () => {
  it('tổng hợp hai chiều và tính thuế phải nộp = đầu ra − đầu vào', async () => {
    const { service } = createService({
      sales_invoices: [
        row({ document_id: 's1', subtotal: '1000000', tax_amount: '100000', total: '1100000' }),
        row({ document_id: 's2', subtotal: '2000000', tax_amount: '200000', total: '2200000' }),
      ],
      vendor_bills: [
        row({ document_id: 'b1', subtotal: '500000', tax_amount: '50000', total: '550000' }),
      ],
    });

    const view = await service.vatReport({ fromDate: '2026-03-01', toDate: '2026-03-31' });

    expect(view.output.documents).toHaveLength(2);
    expect(view.input.documents).toHaveLength(1);
    expect(view.output.subtotal).toBe('3000000.0000');
    expect(view.output.taxAmount).toBe('300000.0000');
    expect(view.input.taxAmount).toBe('50000.0000');
    expect(view.payable).toBe('250000.0000');
    expect(view.documentCounts).toEqual({ output: 2, input: 1 });
  });

  it('đầu vào lớn hơn đầu ra ⇒ payable ÂM (còn được khấu trừ, không cắt về 0)', async () => {
    const { service } = createService({
      sales_invoices: [row({ document_id: 's1', tax_amount: '30000' })],
      vendor_bills: [row({ document_id: 'b1', tax_amount: '100000' })],
    });

    const view = await service.vatReport({ fromDate: '2026-03-01', toDate: '2026-03-31' });

    expect(view.payable).toBe('-70000.0000');
  });

  it('chỉ lấy chứng từ đã ghi sổ: truy vấn lọc theo status = posted', async () => {
    const { service, calls } = createService({ sales_invoices: [], vendor_bills: [] });

    await service.vatReport({ fromDate: '2026-03-01', toDate: '2026-03-31' });

    const sales = calls.find((call) => call.sql.includes('FROM sales_invoices'));
    const bills = calls.find((call) => call.sql.includes('FROM vendor_bills'));
    expect(sales?.params[0]).toBe(InvoiceStatus.POSTED);
    expect(bills?.params[0]).toBe(BillStatus.POSTED);
    expect(sales?.params[1]).toBe('2026-03-01');
    expect(sales?.params[2]).toBe('2026-03-31');
  });

  it('giữ mã số thuế đối tượng; chưa khai ⇒ null', async () => {
    const { service } = createService({
      sales_invoices: [
        row({ document_id: 's1', party_tax_code: null }),
      ],
    });

    const view = await service.vatReport({ fromDate: '2026-03-01', toDate: '2026-03-31' });

    expect(view.output.documents[0].partyTaxCode).toBeNull();
  });

  it('kỳ không có chứng từ ⇒ tổng bằng 0, payable bằng 0', async () => {
    const { service } = createService({});

    const view = await service.vatReport({ fromDate: '2026-03-01', toDate: '2026-03-31' });

    expect(view.output.taxAmount).toBe('0.0000');
    expect(view.input.taxAmount).toBe('0.0000');
    expect(view.payable).toBe('0.0000');
  });

  it('POSTED khớp giá trị enum thật (không hardcode chuỗi trong SQL)', () => {
    expect(POSTED).toBe(InvoiceStatus.POSTED);
  });
});
