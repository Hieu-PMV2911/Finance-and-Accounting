import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import { AllocationsService } from '../allocations/allocations.service.js';
import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import { AllocationSourceType } from '../common/enums/allocation-source-type.enum.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import { PaymentStatus } from '../common/enums/payment-status.enum.js';
import type { Payment } from './entities/payment.entity.js';
import type { CreateAllocationDto } from './dto/create-allocation.dto.js';
import { PaymentAllocationsService } from './payment-allocations.service.js';

/**
 * Phân bổ là **phép cộng có trần** (mục 10.A): hai phiếu đồng thời cùng trả một hóa đơn
 * sẽ cùng đọc \"còn 100\", mỗi bên ghi 60 ⇒ tổng 120 và không có ràng buộc DB nào chặn.
 * Cách chặn duy nhất là **khóa dòng** đích trong transaction rồi mới tính trần.
 *
 * Test này chốt phần logic thuần mà không cần Postgres:
 * - trần theo **nguồn** và theo **đích** đều bị chặn khi vượt, kèm con số còn lại,
 * - \"đặt lại\" cho đúng cặp này **không** bị trừ twice (idempotent theo cặp),
 * - chỉ phân bổ được cho phiếu **đã ghi sổ** và hóa đơn **đã ghi sổ**,
 * - gỡ phân bổ chỉ nhận phân bổ của chính phiếu đó.
 *
 * Phần khóa `FOR UPDATE` thật chỉ chạy được trên PostgreSQL — ghi nhận ở
 * `EXTENSION_PLAN.md` mục 7 (test #3) khi có DB.
 */
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
const INVOICE_ID = '44444444-4444-4444-8444-444444444444';

/** Body chuẩn cho một lần phân bổ vào hóa đơn bán (cùng một đích trong mọi test). */
function allocateDto(amount: string): CreateAllocationDto {
  return {
    targetType: AllocationTargetType.SALES_INVOICE,
    targetId: INVOICE_ID,
    amount,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    code: 'PT-2026-0009',
    status: PaymentStatus.POSTED,
    amount: '100.0000',
    partyId: 'party-1',
    direction: 'receipt',
    method: 'cash',
    date: '2026-03-10',
    ...overrides,
  } as Payment;
}

interface TargetRow {
  id: string;
  total: string;
  code: string;
  status: string;
}

function createService(input: {
  payment?: Payment;
  target?: TargetRow;
  pair?: Decimal;
  sourceAllocated?: Decimal;
  targetAllocated?: Decimal;
}): {
  service: PaymentAllocationsService;
  allocations: {
    amountOfPair: ReturnType<typeof vi.fn>;
    allocatedFromSource: ReturnType<typeof vi.fn>;
    allocatedToTarget: ReturnType<typeof vi.fn>;
    setPairAmount: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    unallocate: ReturnType<typeof vi.fn>;
  };
  manager: { query: ReturnType<typeof vi.fn>; getRepository: ReturnType<typeof vi.fn> };
} {
  const current = input.payment ?? payment();
  const target: TargetRow = input.target ?? {
    id: INVOICE_ID,
    total: '500.0000',
    code: 'INV-2026-0007',
    status: InvoiceStatus.POSTED,
  };

  // `lockPayment` đi qua query builder có khóa bi quan.
  const builder = {
    setLock: vi.fn(() => builder),
    where: vi.fn(() => builder),
    getOne: vi.fn(async () => current),
  };
  const manager = {
    query: vi.fn(async () => [target]),
    getRepository: vi.fn(() => ({ createQueryBuilder: () => builder })),
  };

  const allocations = {
    amountOfPair: vi.fn(async () => input.pair ?? new Decimal(0)),
    allocatedFromSource: vi.fn(async () => input.sourceAllocated ?? new Decimal(0)),
    allocatedToTarget: vi.fn(async () => input.targetAllocated ?? new Decimal(0)),
    setPairAmount: vi.fn(async (payload: Record<string, unknown>) => ({
      id: 'alloc-1',
      amount: payload.amount,
      targetType: payload.targetType,
      targetId: payload.targetId,
      createdAt: new Date('2026-03-10T00:00:00Z'),
    })),
    findById: vi.fn(async () => null),
    unallocate: vi.fn(async () => undefined),
  };

  const dataSource = {
    transaction: vi.fn(async (run: (m: unknown) => Promise<unknown>) => run(manager)),
    query: vi.fn(async () => []),
  } as never;

  const service = new PaymentAllocationsService(
    {
      findOne: vi.fn(async () => current),
    } as never,
    allocations as unknown as AllocationsService,
    dataSource,
  );

  return { service, allocations, manager };
}

describe('PaymentAllocationsService — trần phân bổ', () => {
  it('đặt phân bổ trong hạn mức hai bên ⇒ ghi đúng cặp (nguồn, đích)', async () => {
    const { service, allocations } = createService({});

    const view = await service.allocate(PAYMENT_ID, allocateDto('50.0000'), 'user-poster');

    expect(allocations.setPairAmount).toHaveBeenCalledTimes(1);
    expect(allocations.setPairAmount.mock.calls[0][0]).toMatchObject({
      targetType: AllocationTargetType.SALES_INVOICE,
      targetId: INVOICE_ID,
      sourceType: AllocationSourceType.PAYMENT,
      sourceId: PAYMENT_ID,
      amount: '50.0000',
    });
    expect(view).toMatchObject({
      targetCode: 'INV-2026-0007',
      amount: '50.0000',
    });
  });

  it('vượt hạn mức của PHIẾU ⇒ chặn và nói rõ còn bao nhiêu', async () => {
    // Phiếu 100, đã phân bổ 80 (cặp này 0) ⇒ chỉ còn 20.
    const { service, allocations } = createService({
      sourceAllocated: new Decimal('80'),
    });

    await expect(
      service.allocate(PAYMENT_ID, allocateDto('30.0000'), 'user-poster'),
    ).rejects.toThrow('chỉ còn 20.0000 chưa phân bổ');

    expect(allocations.setPairAmount).not.toHaveBeenCalled();
  });

  it('vượt hạn mức của HÓA ĐƠN ⇒ chặn và nói rõ còn bao nhiêu', async () => {
    // Hóa đơn 200, đã nhận 180 (cặp này 0) ⇒ chỉ còn 20.
    const { service, allocations } = createService({
      target: {
        id: INVOICE_ID,
        total: '200.0000',
        code: 'INV-2026-0007',
        status: InvoiceStatus.POSTED,
      },
      targetAllocated: new Decimal('180'),
    });

    await expect(
      service.allocate(PAYMENT_ID, allocateDto('25.0000'), 'user-poster'),
    ).rejects.toThrow('chỉ còn 20.0000 chưa được thanh toán');

    expect(allocations.setPairAmount).not.toHaveBeenCalled();
  });

  it('gửi lại đúng số tiền cho cùng cặp ⇒ không bị trừ hai lần (idempotent theo cặp)', async () => {
    // Cặp này đã có 10; tổng đã phân bổ nguồn 50, đích 100 — đặt lại 10 vẫn hợp lệ
    // vì phần của chính cặp này bị trừ khỏi trần.
    const { service } = createService({
      pair: new Decimal('10'),
      sourceAllocated: new Decimal('50'),
      targetAllocated: new Decimal('100'),
      target: {
        id: INVOICE_ID,
        total: '200.0000',
        code: 'INV-2026-0007',
        status: InvoiceStatus.POSTED,
      },
    });

    const view = await service.allocate(PAYMENT_ID, allocateDto('10.0000'), 'user-poster');

    expect(view.amount).toBe('10.0000');
  });

  it('chỉ phân bổ được cho phiếu ĐÃ ghi sổ', async () => {
    for (const status of [PaymentStatus.DRAFT, PaymentStatus.APPROVED, PaymentStatus.VOIDED]) {
      const { service } = createService({ payment: payment({ status }) });

      await expect(
        service.allocate(PAYMENT_ID, allocateDto('10.0000'), 'user-poster'),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('hóa đơn đích chưa ghi sổ ⇒ bị chặn ngay khi khóa dòng đích', async () => {
    const { service } = createService({
      target: {
        id: INVOICE_ID,
        total: '500.0000',
        code: 'INV-2026-0006',
        status: InvoiceStatus.DRAFT,
      },
    });

    await expect(
      service.allocate(PAYMENT_ID, allocateDto('10.0000'), 'user-poster'),
    ).rejects.toThrow('đã ghi sổ');
  });

  it('gỡ phân bổ: không thuộc phiếu này ⇒ không tìm thấy; phiếu đã hủy ⇒ chặn', async () => {
    const { service, allocations } = createService({});
    allocations.findById.mockResolvedValue({
      id: 'alloc-x',
      sourceType: AllocationSourceType.PAYMENT,
      sourceId: 'khac-vai-id',
    });

    await expect(service.unallocate(PAYMENT_ID, 'alloc-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const second = createService({ payment: payment({ status: PaymentStatus.VOIDED }) });
    await expect(
      second.service.unallocate(PAYMENT_ID, 'alloc-x'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(second.allocations.unallocate).not.toHaveBeenCalled();
  });
});
