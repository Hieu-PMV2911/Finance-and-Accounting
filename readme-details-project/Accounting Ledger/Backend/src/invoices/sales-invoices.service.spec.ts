import { BadRequestException, ConflictException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import { JobTrigger } from '../jobs/enums/job.enum.js';
import { WebhookEventType } from '../jobs/enums/webhook.enum.js';
import { SalesInvoicesService } from './sales-invoices.service.js';
import { SalesInvoice } from './entities/sales-invoice.entity.js';

/**
 * Vòng đời hóa đơn bán (P1.2) + sự kiện phát ra ngoài (P1.4).
 *
 * Ba thứ được chốt ở đây, vì build xanh không bắt được:
 * - `approve` chỉ đi từ `draft`, `post` chỉ đi từ `draft`/`approved`, `voided` không post lại được;
 * - bút toán sinh ra mang **đúng** `sourceType`/`sourceId` (điều kiện để truy vết và để unique
 *   `(source_type, source_id)` chặn ghi trùng);
 * - sau khi ghi sổ có phát webhook `sales_invoice.posted` với `resourceRef` = id hóa đơn.
 *
 * Hủy hóa đơn còn phân bổ phải **bị chặn** — nếu không, công nợ sẽ trỏ vào chứng từ đã hủy.
 */
const UUID = '11111111-1111-4111-8111-111111111111';

function invoice(overrides: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: UUID,
    invoiceNo: 'INV-2026-0001',
    partyId: 'party-1',
    date: '2026-03-01',
    dueDate: '2026-03-31',
    description: 'Bán hàng',
    currency: 'VND',
    status: InvoiceStatus.DRAFT,
    subtotal: '1000000.0000',
    taxAmount: '0.0000',
    total: '1000000.0000',
    receivableAccountId: 'acc-131',
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
        invoiceId: UUID,
        lineNo: 1,
        accountId: 'acc-511',
        description: null,
        quantity: '1.0000',
        unitPrice: '1000000.0000',
        amount: '1000000.0000',
        taxCodeId: null,
        taxRate: '0.0000',
        taxAmount: '0.0000',
      },
    ],
    party: undefined,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  } as SalesInvoice;
}

function createService(current: SalesInvoice): {
  service: SalesInvoicesService;
  invoices: { save: ReturnType<typeof vi.fn> };
  journals: {
    postDocument: ReturnType<typeof vi.fn>;
    reverseDocument: ReturnType<typeof vi.fn>;
  };
  webhooks: { dispatch: ReturnType<typeof vi.fn> };
  allocations: { allocatedToTarget: ReturnType<typeof vi.fn> };
  taxes: {
    resolveDocumentTaxes: ReturnType<typeof vi.fn>;
    groupVatByAccount: ReturnType<typeof vi.fn>;
  };
  accountDefaults: { resolveLineAccount: ReturnType<typeof vi.fn> };
  linesRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  manager: { update: ReturnType<typeof vi.fn> };
} {
  const invoices = {
    findOne: vi.fn(async () => current),
    save: vi.fn(async (entity: SalesInvoice) => entity),
    create: vi.fn((entity: Partial<SalesInvoice>) => entity),
  };
  const manager = { update: vi.fn(async () => ({ affected: 1 })) };
  const journals = {
    // Mô phỏn đúng hợp đồng thật: gộp tạo + ghi sổ + cập nhật chứng từ trong một transaction.
    postDocument: vi.fn(
      async (
        dto: unknown,
        _actorId: string,
        commit: (m: unknown, entry: unknown) => Promise<void>,
      ) => {
        const entry = { id: 'entry-1' };
        await commit(manager, entry);
        return entry;
      },
    ),
    reverseDocument: vi.fn(
      async (
        _id: string,
        dto: unknown,
        _actorId: string,
        commit: (m: unknown, reversal: unknown) => Promise<void>,
      ) => {
        const reversal = { id: 'entry-reversal' };
        await commit(manager, reversal);
        return reversal;
      },
    ),
  };
  const webhooks = { dispatch: vi.fn(async () => []) };
  const allocations = {
    allocatedToTarget: vi.fn(async () => new Decimal(0)),
  };
  const accounts = {
    getPostable: vi.fn(async () => ({ id: 'acc-131', code: '131' })),
    requirePostableByCodePrefix: vi.fn(async () => ({
      id: 'acc-131',
      code: '131',
    })),
  };
  const periods = {
    resolveByDate: vi.fn(async () => ({ id: 'period-1' })),
    assertAcceptsPostings: vi.fn(),
  };

  // Mục 10.C.2 — mặc định "không thuế": mọi dòng 0 và không có dòng bút toán thuế nào.
  const taxes = {
    resolveDocumentTaxes: vi.fn(
      async (lines: { amount: string }[]) => ({
        lines: lines.map(() => ({
          taxCodeId: null,
          taxCode: null,
          taxRate: '0.0000',
          taxAmount: '0.0000',
        })),
        headerTax: new Decimal(0),
      }),
    ),
    groupVatByAccount: vi.fn(async () => []),
  };
  const accountDefaults = {
    resolveLineAccount: vi.fn(async () => ({ id: 'acc-511', code: '511' })),
  };
  const linesRepo = {
    create: vi.fn((entity: unknown) => entity),
    save: vi.fn(async (entity: unknown) => entity),
    delete: vi.fn(async () => ({ affected: 0 })),
  };

  const service = new SalesInvoicesService(
    invoices as never,
    linesRepo as never,
    { resolveActive: vi.fn() } as never,
    accounts as never,
    accountDefaults as never,
    allocations as never,
    periods as never,
    journals as never,
    webhooks as never,
    taxes as never,
    { transaction: vi.fn() } as never,
  );

  return {
    service,
    invoices,
    journals,
    webhooks,
    allocations,
    taxes,
    accountDefaults,
    linesRepo,
    manager,
  };
}

describe('SalesInvoicesService — vòng đời & ghi sổ', () => {
  it('approve: draft → approved, ghi người duyệt và thời điểm', async () => {
    const current = invoice();
    const { service, invoices } = createService(current);

    const result = await service.approve(UUID, 'user-checker');

    expect(result.status).toBe(InvoiceStatus.APPROVED);
    expect(result.approvedBy).toBe('user-checker');
    expect(result.approvedAt).toBeInstanceOf(Date);
    expect(invoices.save).toHaveBeenCalledOnce();
  });

  it('approve: chỉ nhận hóa đơn nháp', async () => {
    const { service } = createService(
      invoice({ status: InvoiceStatus.POSTED }),
    );

    await expect(service.approve(UUID, 'user-checker')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('post: sinh bút toán gắn sourceType/sourceId rồi phát webhook sales_invoice.posted', async () => {
    const current = invoice({ status: InvoiceStatus.APPROVED });
    const { service, journals, webhooks, manager } = createService(current);

    const result = await service.post(UUID, 'user-poster');

    expect(result.status).toBe(InvoiceStatus.POSTED);
    expect(result.journalEntryId).toBe('entry-1');
    expect(result.postedBy).toBe('user-poster');

    // Cập nhật hóa đơn phải nằm TRONG transaction ghi sổ (P1.2), không phải câu save riêng.
    expect(journals.postDocument).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(SalesInvoice, UUID, {
      status: InvoiceStatus.POSTED,
      journalEntryId: 'entry-1',
      postedBy: 'user-poster',
      postedAt: expect.any(Date) as Date,
      receivableAccountId: 'acc-131',
    });

    const createdDto = journals.postDocument.mock.calls[0][0] as {
      sourceType: string;
      sourceId: string;
      reference: string;
      lines: { debit?: string; credit?: string; partyId?: string }[];
    };
    expect(createdDto.sourceType).toBe(SourceType.SALES_INVOICE);
    expect(createdDto.sourceId).toBe(UUID);
    expect(createdDto.reference).toBe('INV-2026-0001');
    // Nợ 131 kèm đối tượng, Có doanh thu theo từng dòng.
    expect(createdDto.lines[0]).toMatchObject({
      debit: '1000000.0000',
      partyId: 'party-1',
    });
    expect(createdDto.lines[1]).toMatchObject({ credit: '1000000.0000' });

    const dispatchInput = webhooks.dispatch.mock.calls[0][0] as {
      eventType: string;
      resourceRef: string;
      trigger: string;
      data: Record<string, unknown>;
    };
    expect(dispatchInput.eventType).toBe(WebhookEventType.SALES_INVOICE_POSTED);
    expect(dispatchInput.resourceRef).toBe(UUID);
    expect(dispatchInput.trigger).toBe(JobTrigger.SYSTEM);
    expect(dispatchInput.data).toMatchObject({
      invoiceNo: 'INV-2026-0001',
      partyId: 'party-1',
      total: '1000000.0000',
      journalEntryId: 'entry-1',
    });
  });

  it('post: hóa đơn đã ghi sổ hoặc đã hủy ⇒ từ chối, không phát webhook', async () => {
    for (const status of [InvoiceStatus.POSTED, InvoiceStatus.VOIDED]) {
      const { service, webhooks, journals } = createService(invoice({ status }));

      await expect(service.post(UUID, 'user-poster')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(webhooks.dispatch).not.toHaveBeenCalled();
      expect(journals.postDocument).not.toHaveBeenCalled();
    }
  });

  it('void: hóa đơn đã ghi sổ ⇒ sinh bút toán đảo và chuyển voided', async () => {
    const current = invoice({
      status: InvoiceStatus.POSTED,
      journalEntryId: 'entry-1',
    });
    const { service, journals, manager } = createService(current);

    const result = await service.voidInvoice(
      UUID,
      { reason: 'Xuất sai mã số thuế', date: '2026-03-20' },
      'user-poster',
    );

    expect(journals.reverseDocument).toHaveBeenCalledWith(
      'entry-1',
      { reason: 'Xuất sai mã số thuế', date: '2026-03-20' },
      'user-poster',
      expect.any(Function) as unknown as never,
    );
    // Chuyển `voided` nằm cùng transaction với bút toán đảo.
    expect(manager.update).toHaveBeenCalledWith(SalesInvoice, UUID, {
      status: InvoiceStatus.VOIDED,
      voidedBy: 'user-poster',
      voidedAt: expect.any(Date) as Date,
      voidReason: 'Xuất sai mã số thuế',
      reversalJournalEntryId: 'entry-reversal',
    });
    expect(result.status).toBe(InvoiceStatus.VOIDED);
    expect(result.reversalJournalEntryId).toBe('entry-reversal');
    expect(result.voidReason).toBe('Xuất sai mã số thuế');
  });

  it('void: hóa đơn nháp chỉ đổi trạng thái, không sinh bút toán đảo', async () => {
    const { service, journals } = createService(invoice());

    const result = await service.voidInvoice(
      UUID,
      { reason: 'Lập nhầm', date: '2026-03-02' },
      'user-maker',
    );

    expect(journals.reverseDocument).not.toHaveBeenCalled();
    expect(result.status).toBe(InvoiceStatus.VOIDED);
  });

  it('void: còn phân bổ thanh toán ⇒ chặn (công nợ không được trỏ vào chứng từ đã hủy)', async () => {
    const { service, allocations } = createService(
      invoice({ status: InvoiceStatus.POSTED, journalEntryId: 'entry-1' }),
    );
    allocations.allocatedToTarget.mockResolvedValue(new Decimal('200000'));

    await expect(
      service.voidInvoice(
        UUID,
        { reason: 'Sai', date: '2026-03-02' },
        'user-poster',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

/**
 * Mục 10.C.2 — thuế GTGT đầu ra.
 *
 * Điều đáng test ở đây **không** phải "có thuế thì cộng thêm một dòng", mà là **bất biến
 * cân bằng**: trước 10.C.2, `post` ghi Nợ 131 = tổng nhưng chỉ Có doanh thu = subtotal,
 * nên hóa đơn có thuế sinh ra bút toán **mất cân bằng**. Test dưới đây chốt rằng phần
 * chênh lệch nay có một dòng Có TK thuế, và rằng thuế đầu chứng từ lệch tổng các dòng
 * thì **bị chặn** chứ không âm thầm ghi sổ theo một con số sai.
 */
describe('SalesInvoicesService — thuế GTGT đầu ra (mục 10.C.2)', () => {
  it('post: sinh dòng Có TK thuế (3331) và Σ Nợ = Σ Có', async () => {
    const base = invoice();
    const current = invoice({
      status: InvoiceStatus.APPROVED,
      subtotal: '1000000.0000',
      taxAmount: '100000.0000',
      total: '1100000.0000',
      lines: [
        {
          ...base.lines[0],
          amount: '1000000.0000',
          taxCodeId: 'tax-10',
          taxRate: '10.0000',
          taxAmount: '100000.0000',
        },
      ],
    });
    const { service, journals, taxes } = createService(current);
    taxes.groupVatByAccount.mockResolvedValue([
      { accountId: 'acc-3331', amount: '100000.0000' },
    ]);

    await service.post(UUID, 'user-poster');

    // Tài khoản thuế phải được giải theo chiều **đầu ra**.
    expect(taxes.groupVatByAccount).toHaveBeenCalledWith(current.lines, 'output');

    const dto = journals.postDocument.mock.calls[0][0] as {
      lines: { accountId: string; debit?: string; credit?: string }[];
    };
    expect(dto.lines).toHaveLength(3);
    expect(dto.lines[0]).toMatchObject({ accountId: 'acc-131', debit: '1100000.0000' });
    expect(dto.lines[1]).toMatchObject({ accountId: 'acc-511', credit: '1000000.0000' });
    expect(dto.lines[2]).toMatchObject({ accountId: 'acc-3331', credit: '100000.0000' });

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

  it('post: thuế đầu hóa đơn lệch tổng thuế các dòng ⇒ từ chối, không ghi sổ', async () => {
    const base = invoice();
    const current = invoice({
      status: InvoiceStatus.APPROVED,
      taxAmount: '50000.0000',
      lines: [{ ...base.lines[0], taxAmount: '100000.0000' }],
    });
    const { service, journals } = createService(current);

    await expect(service.post(UUID, 'user-poster')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(journals.postDocument).not.toHaveBeenCalled();
  });

  it('create: tổng thuế lấy theo dòng và thuế suất được sao lại vào dòng', async () => {
    const { service, taxes, linesRepo, invoices } = createService(invoice());
    taxes.resolveDocumentTaxes.mockResolvedValue({
      lines: [
        {
          taxCodeId: 'tax-10',
          taxCode: 'VAT10',
          taxRate: '10.0000',
          taxAmount: '100000.0000',
        },
      ],
      headerTax: new Decimal('100000'),
    });

    await service.create(
      {
        invoiceNo: 'INV-2026-0002',
        partyId: 'party-1',
        date: '2026-03-01',
        subtotal: '1000000.0000',
        taxAmount: '100000.0000',
        total: '1100000.0000',
        lines: [{ amount: '1000000.0000', taxCodeId: 'tax-10' }],
      },
      { id: 'user-maker' } as never,
    );

    expect(invoices.save).toHaveBeenCalledWith(
      expect.objectContaining({ taxAmount: '100000.0000', total: '1100000.0000' }),
    );
    expect(linesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taxCodeId: 'tax-10',
        taxRate: '10.0000',
        taxAmount: '100000.0000',
      }),
    );
  });

  it('create: subtotal + thuế khác tổng tiền ⇒ từ chối', async () => {
    const { service, taxes } = createService(invoice());
    taxes.resolveDocumentTaxes.mockResolvedValue({
      lines: [
        { taxCodeId: 'tax-10', taxCode: 'VAT10', taxRate: '10.0000', taxAmount: '100000.0000' },
      ],
      headerTax: new Decimal('100000'),
    });

    await expect(
      service.create(
        {
          invoiceNo: 'INV-2026-0003',
          partyId: 'party-1',
          date: '2026-03-01',
          subtotal: '1000000.0000',
          taxAmount: '100000.0000',
          total: '1090000.0000',
          lines: [{ amount: '1000000.0000', taxCodeId: 'tax-10' }],
        },
        { id: 'user-maker' } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
