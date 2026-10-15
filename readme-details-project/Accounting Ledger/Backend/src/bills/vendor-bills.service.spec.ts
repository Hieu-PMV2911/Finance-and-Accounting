import { ConflictException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import { BillStatus } from '../common/enums/bill-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { VendorBillsService } from './vendor-bills.service.js';
import { VendorBill } from './entities/vendor-bill.entity.js';

/**
 * Mục 10.C.2 — thuế GTGT **đầu vào** khi ghi sổ hóa đơn mua.
 *
 * Đây là nửa đối xứng của hóa đơn bán, và là nửa dễ sai nhất: thuế đầu vào được **khấu
 * trừ** nên nằm bên **Nợ TK 1331** (tài sản), không phải bên Có. Nếu ghi nhầm chiều thì
 * bút toán vẫn "cân" về tổng nhưng làm sai cả bảng cân đối lẫn bảng kê thuế.
 *
 * Trước 10.C.2, `post` chỉ ghi Nợ chi phí = subtotal nhưng Có phải trả = tổng ⇒ hóa đơn
 * mua có thuế sinh bút toán **mất cân bằng**. Test dưới đây khoá lại điều đó.
 */
const UUID = '33333333-3333-4333-8333-333333333333';

function bill(overrides: Partial<VendorBill> = {}): VendorBill {
  return {
    id: UUID,
    billNo: 'BILL-2026-0001',
    partyId: 'party-1',
    date: '2026-03-01',
    dueDate: '2026-03-31',
    description: 'Mua dịch vụ',
    currency: 'VND',
    status: BillStatus.APPROVED,
    subtotal: '1000000.0000',
    taxAmount: '100000.0000',
    total: '1100000.0000',
    payableAccountId: 'acc-331',
    journalEntryId: null,
    reversalJournalEntryId: null,
    createdBy: 'user-maker',
    approvedBy: null,
    approvedAt: null,
    postedBy: null,
    postedAt: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    lines: [
      {
        id: 'line-1',
        billId: UUID,
        lineNo: 1,
        accountId: 'acc-642',
        description: null,
        quantity: '1.0000',
        unitPrice: '1000000.0000',
        amount: '1000000.0000',
        taxCodeId: 'tax-10',
        taxRate: '10.0000',
        taxAmount: '100000.0000',
      },
    ],
    party: undefined,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  } as VendorBill;
}

function createService(current: VendorBill): {
  service: VendorBillsService;
  journals: { postDocument: ReturnType<typeof vi.fn> };
  taxes: { groupVatByAccount: ReturnType<typeof vi.fn> };
} {
  const bills = {
    findOne: vi.fn(async () => current),
    save: vi.fn(async (entity: VendorBill) => entity),
    create: vi.fn((entity: Partial<VendorBill>) => entity),
  };
  const manager = { update: vi.fn(async () => ({ affected: 1 })) };
  const journals = {
    postDocument: vi.fn(
      async (
        _dto: unknown,
        _actorId: string,
        commit: (m: unknown, entry: unknown) => Promise<void>,
      ) => {
        const entry = { id: 'entry-1' };
        await commit(manager, entry);
        return entry;
      },
    ),
  };
  const accounts = {
    getPostable: vi.fn(async () => ({ id: 'acc-331', code: '331' })),
    requirePostableByCodePrefix: vi.fn(async () => ({ id: 'acc-331', code: '331' })),
  };
  const taxes = {
    resolveDocumentTaxes: vi.fn(),
    groupVatByAccount: vi.fn(async () => []),
  };

  const service = new VendorBillsService(
    bills as never,
    { save: vi.fn(), delete: vi.fn(), create: vi.fn() } as never,
    { resolveActive: vi.fn() } as never,
    accounts as never,
    { resolveLineAccount: vi.fn() } as never,
    { allocatedToTarget: vi.fn() } as never,
    {
      resolveByDate: vi.fn(async () => ({ id: 'period-1' })),
      assertAcceptsPostings: vi.fn(),
    } as never,
    journals as never,
    { dispatch: vi.fn(async () => []) } as never,
    taxes as never,
    { transaction: vi.fn() } as never,
  );

  return { service, journals, taxes };
}

describe('VendorBillsService — thuế GTGT đầu vào (mục 10.C.2)', () => {
  it('post: thuế đầu vào ghi Nợ TK 1331 và Σ Nợ = Σ Có', async () => {
    const current = bill();
    const { service, journals, taxes } = createService(current);
    taxes.groupVatByAccount.mockResolvedValue([
      { accountId: 'acc-1331', amount: '100000.0000' },
    ]);

    const result = await service.post(UUID, 'user-poster');

    expect(result.status).toBe(BillStatus.POSTED);
    // Chiều thuế phải là **input**.
    expect(taxes.groupVatByAccount).toHaveBeenCalledWith(current.lines, 'input');

    const dto = journals.postDocument.mock.calls[0][0] as {
      sourceType: string;
      lines: { accountId: string; debit?: string; credit?: string; partyId?: string }[];
    };
    expect(dto.sourceType).toBe(SourceType.VENDOR_BILL);
    // Nợ chi phí (642) + Nợ thuế đầu vào (1331) / Có phải trả (331, kèm đối tượng).
    expect(dto.lines).toHaveLength(3);
    expect(dto.lines[0]).toMatchObject({ accountId: 'acc-642', debit: '1000000.0000' });
    expect(dto.lines[1]).toMatchObject({ accountId: 'acc-1331', debit: '100000.0000' });
    expect(dto.lines[2]).toMatchObject({
      accountId: 'acc-331',
      credit: '1100000.0000',
      partyId: 'party-1',
    });

    const debit = dto.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.debit ?? '0')),
      new Decimal(0),
    );
    const credit = dto.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.credit ?? '0')),
      new Decimal(0),
    );
    expect(debit.equals(credit)).toBe(true);
  });

  it('post: thuế đầu hóa đơn mua lệch tổng thuế các dòng ⇒ từ chối, không ghi sổ', async () => {
    const current = bill({ taxAmount: '50000.0000' });
    const { service, journals } = createService(current);

    await expect(service.post(UUID, 'user-poster')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(journals.postDocument).not.toHaveBeenCalled();
  });

  it('post: hóa đơn mua không thuế ⇒ chỉ hai dòng, không sinh dòng 1331', async () => {
    const base = bill();
    const current = bill({
      subtotal: '1000000.0000',
      taxAmount: '0.0000',
      total: '1000000.0000',
      lines: [
        { ...base.lines[0], taxCodeId: null, taxRate: '0.0000', taxAmount: '0.0000' },
      ],
    });
    const { service, journals, taxes } = createService(current);

    await service.post(UUID, 'user-poster');

    const dto = journals.postDocument.mock.calls[0][0] as { lines: unknown[] };
    expect(dto.lines).toHaveLength(2);
    // Không có dòng thuế nào ⇒ không cần giải tài khoản thuế.
    expect(taxes.groupVatByAccount).toHaveBeenCalledWith(current.lines, 'input');
  });
});
