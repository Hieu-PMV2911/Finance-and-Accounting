import { describe, expect, it } from 'vitest';

import { BankTransactionDirection } from '../enums/bank-transaction.enum.js';
import { CsvJsonStatementAdapter } from './csv-json-statement.adapter.js';

/**
 * Mục 8 bắt buộc: CSV và API/file phải cho ra **cùng** `NormalizedBankTransaction`
 * với cùng dữ liệu nghiệp vụ. Ở đây chứng minh hai định dạng đầu vào (CSV và
 * JSON) đi qua **một** đường chuẩn hóa duy nhất.
 */
describe('CsvJsonStatementAdapter', () => {
  const adapter = new CsvJsonStatementAdapter();

  const csv = [
    'transaction_date,description,reference,bank_ref,amount,direction,currency',
    '2026-10-12,Chuyen tien DH-2026-0912,DH-2026-0912,BR-001,1500000.0000,in,VND',
    '2026-10-13,Phi chuyen khoan,,BR-002,-25000.0000,out,VND',
  ].join('\n');

  const json = JSON.stringify([
    {
      transaction_date: '2026-10-12',
      description: 'Chuyen tien DH-2026-0912',
      reference: 'DH-2026-0912',
      bank_ref: 'BR-001',
      amount: '1500000.0000',
      direction: 'in',
      currency: 'VND',
    },
    {
      transaction_date: '2026-10-13',
      description: 'Phi chuyen khoan',
      reference: '',
      bank_ref: 'BR-002',
      amount: '-25000.0000',
      direction: 'out',
      currency: 'VND',
    },
  ]);

  it('CSV và JSON cho ra CÙNG danh sách NormalizedBankTransaction', () => {
    const fromCsv = adapter.parse({ content: csv });
    const fromJson = adapter.parse({ content: json });

    expect(fromCsv).toHaveLength(2);
    expect(fromJson).toHaveLength(2);

    // So sánh từng dòng, bỏ qua `raw` (khác nhau về hình thức nhưng cùng thông tin).
    const stripRaw = (rows: ReturnType<typeof adapter.parse>) =>
      rows.map(({ raw: _raw, ...rest }) => rest);

    expect(stripRaw(fromCsv)).toEqual(stripRaw(fromJson));
  });

  it('đọc đúng chiều tiền, số tiền luôn dương, bankRef để khớp tầng 1', () => {
    const rows = adapter.parse({ content: csv });

    expect(rows[0]).toMatchObject({
      transactionDate: '2026-10-12',
      direction: BankTransactionDirection.IN,
      amount: '1500000.0000',
      bankRef: 'BR-001',
      reference: 'DH-2026-0912',
      currency: 'VND',
    });

    // Số âm trong file ⇒ direction = out, nhưng amount LUÔN dương.
    expect(rows[1].direction).toBe(BankTransactionDirection.OUT);
    expect(rows[1].amount).toBe('25000.0000');
  });

  it('chấp nhận tên cột tiếng Việt có dấu', () => {
    const vietnamese = [
      'Ngày giao dịch,Diễn giải,Số tiền,Chiều',
      '2026-10-12,Thu nợ khách,1500000.0000,thu',
    ].join('\n');

    const rows = adapter.parse({ content: vietnamese });
    expect(rows[0]).toMatchObject({
      transactionDate: '2026-10-12',
      description: 'Thu nợ khách',
      amount: '1500000.0000',
      direction: BankTransactionDirection.IN,
    });
  });

  it('hỗ trợ dấu phẩy trong ngoặc kép ở mô tả', () => {
    const quoted = [
      'transaction_date,description,amount,direction',
      '2026-10-12,"Chuyen tien HĐ 09, 12",1500000.0000,in',
    ].join('\n');

    const rows = adapter.parse({ content: quoted });
    expect(rows[0].description).toBe('Chuyen tien HĐ 09, 12');
  });

  it('báo lỗi rõ ràng khi thiếu cột bắt buộc hoặc ngày sai', () => {
    const missingAmount = [
      'transaction_date,direction',
      '2026-10-12,in',
    ].join('\n');
    expect(() => adapter.parse({ content: missingAmount })).toThrow(/amount/);

    const badDate = [
      'transaction_date,amount,direction',
      '2026-02-31,1000,in',
    ].join('\n');
    expect(() => adapter.parse({ content: badDate })).toThrow(
      /YYYY-MM-DD|không hợp lệ/,
    );

    const noDirection = [
      'transaction_date,amount',
      '2026-10-12,1000',
    ].join('\n');
    expect(() => adapter.parse({ content: noDirection })).toThrow(/direction/);
  });

  it('từ chối nội dung rỗng hoặc JSON hỏng', () => {
    expect(() => adapter.parse({ content: '   ' })).toThrow(/trống/);
    expect(() => adapter.parse({ content: '[{"broken"' })).toThrow(/JSON/);
  });
});
