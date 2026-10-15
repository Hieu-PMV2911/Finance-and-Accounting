import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AllocationsService } from '../allocations/allocations.service.js';
import { AllocationSourceType } from '../common/enums/allocation-source-type.enum.js';
import { AllocationTargetType } from '../common/enums/allocation-target-type.enum.js';
import { BillStatus } from '../common/enums/bill-status.enum.js';
import { InvoiceStatus } from '../common/enums/invoice-status.enum.js';
import {
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '../common/enums/payment-status.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import type { CreateAllocationDto } from './dto/create-allocation.dto.js';
import { Payment } from './entities/payment.entity.js';

/**
 * Bảng đích của phân bổ. Tên bảng/cột nằm trong hằng số **theo enum**, không bao giờ
 * lấy từ input người dùng ⇒ không có đường chèn SQL.
 */
const TARGET_META: Record<
  AllocationTargetType,
  { table: string; codeColumn: string; status: string; label: string }
> = {
  [AllocationTargetType.SALES_INVOICE]: {
    table: 'sales_invoices',
    codeColumn: 'invoice_no',
    status: InvoiceStatus.POSTED,
    label: 'hóa đơn bán',
  },
  [AllocationTargetType.VENDOR_BILL]: {
    table: 'vendor_bills',
    codeColumn: 'bill_no',
    status: BillStatus.POSTED,
    label: 'hóa đơn mua',
  },
};

export interface AllocationView {
  id: string;
  targetType: AllocationTargetType;
  targetId: string;
  /** Số chứng từ đích, để người dùng đọc được mà không phải tra id. */
  targetCode: string | null;
  amount: string;
  createdAt: Date;
}

/**
 * Phân bổ phiếu thu/chi vào hóa đơn (mục 10.A).
 *
 * **Vì sao phải khóa cả hai bên:** phân bổ là phép cộng có trần. Hai phiếu thu đồng thời
 * cùng trả một hóa đơn 100 triệu sẽ cùng đọc "còn 100", mỗi bên ghi 60, tổng thành 120 —
 * và không có ràng buộc DB nào chặn được vì mỗi dòng riêng lẻ đều hợp lệ. Cách chặn duy
 * nhất là **khóa dòng chứng từ đích** trong transaction trước khi tính số còn lại.
 *
 * Nghiệp vụ đã chốt: phân bổ là thao tác **thủ công có kiểm soát**, không tự động "khớp
 * hết", và **không** sinh bút toán mới — bút toán đã đúng ở mức tổng.
 */
@Injectable()
export class PaymentAllocationsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly allocations: AllocationsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Danh sách phân bổ của một phiếu (kèm số chứng từ đích). */
  async list(paymentId: string): Promise<AllocationView[]> {
    const payment = await this.requirePayment(paymentId);
    const rows = await this.allocations.listBySource(
      AllocationSourceType.PAYMENT,
      payment.id,
    );
    const codes = await this.targetCodeMap(rows.map((row) => [row.targetType, row.targetId]));

    return rows.map((row) => ({
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      targetCode: codes.get(`${row.targetType}:${row.targetId}`) ?? null,
      amount: row.amount,
      createdAt: row.createdAt,
    }));
  }

  /**
   * **Đặt** số tiền phân bổ của phiếu vào một chứng từ đích.
   *
   * Toàn bộ nằm trong **một transaction**, theo thứ tự:
   * 1. khóa dòng phiếu (chặn hai request cùng sửa một phiếu),
   * 2. kiểm phiếu **đã ghi sổ** (chưa ghi sổ thì chưa có tiền để phân bổ),
   * 3. khóa dòng chứng từ đích + kiểm trạng thái `posted`,
   * 4. kiểm trần **hai bên**, đã trừ phần của chính cặp này,
   * 5. ghi/cập nhật dòng phân bổ.
   *
   * Thao tác là **idempotent theo cặp**: gửi lại cùng số tiền (do retry) cho kết quả
   * y hệt, không cộng dồn.
   */
  async allocate(
    paymentId: string,
    dto: CreateAllocationDto,
    actorId: string,
  ): Promise<AllocationView> {
    const amount = toMoney(dto.amount);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('Số tiền phân bổ phải lớn hơn 0');
    }

    return this.dataSource.transaction(async (manager) => {
      const payment = await this.lockPayment(manager, paymentId);
      if (payment.status !== PaymentStatus.POSTED) {
        throw new BadRequestException(
          `Chỉ phân bổ được phiếu đã ghi sổ (phiếu ${payment.code} đang ở trạng thái "${PAYMENT_STATUS_LABELS[payment.status]}")`,
        );
      }

      const target = await this.lockTarget(manager, dto.targetType, dto.targetId);

      const pair = await this.allocations.amountOfPair(
        AllocationSourceType.PAYMENT,
        payment.id,
        dto.targetType,
        target.id,
        manager,
      );
      const sourceAllocated = await this.allocations.allocatedFromSource(
        AllocationSourceType.PAYMENT,
        payment.id,
        manager,
      );
      const targetAllocated = await this.allocations.allocatedToTarget(
        dto.targetType,
        target.id,
        manager,
      );

      // Trần đã trừ phần của chính cặp: "đặt lại" không bị tính hai lần.
      const sourceHeadroom = toMoney(payment.amount).minus(
        sourceAllocated.minus(pair),
      );
      const targetHeadroom = toMoney(target.total).minus(
        targetAllocated.minus(pair),
      );

      if (amount.greaterThan(sourceHeadroom)) {
        throw new BadRequestException(
          `Phiếu ${payment.code} chỉ còn ${moneyToString(sourceHeadroom)} chưa phân bổ`,
        );
      }
      if (amount.greaterThan(targetHeadroom)) {
        throw new BadRequestException(
          `${TARGET_META[dto.targetType].label} ${target.code} chỉ còn ${moneyToString(targetHeadroom)} chưa được thanh toán`,
        );
      }

      const saved = await this.allocations.setPairAmount(
        {
          targetType: dto.targetType,
          targetId: target.id,
          sourceType: AllocationSourceType.PAYMENT,
          sourceId: payment.id,
          amount: moneyToString(amount),
          createdBy: actorId,
        },
        manager,
      );

      return {
        id: saved.id,
        targetType: saved.targetType,
        targetId: saved.targetId,
        targetCode: target.code,
        amount: saved.amount,
        createdAt: saved.createdAt,
      };
    });
  }

  /** Gỡ phân bổ (gỡ là xóa dòng — không sinh bút toán, chỉ trả công nợ về trạng thái trước). */
  async unallocate(paymentId: string, allocationId: string): Promise<void> {
    const payment = await this.requirePayment(paymentId);

    if (payment.status === PaymentStatus.VOIDED) {
      throw new BadRequestException('Phiếu đã hủy — không sửa phân bổ');
    }

    const allocation = await this.allocations.findById(allocationId);
    if (
      !allocation ||
      allocation.sourceType !== AllocationSourceType.PAYMENT ||
      allocation.sourceId !== payment.id
    ) {
      throw new NotFoundException('Không tìm thấy phân bổ của phiếu này');
    }

    await this.allocations.unallocate(allocationId);
  }

  // ---------------------------------------------------------------- helpers

  private async requirePayment(id: string): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException('Không tìm thấy phiếu thu/chi');
    }
    return payment;
  }

  private async lockPayment(
    manager: EntityManager,
    id: string,
  ): Promise<Payment> {
    const payment = await manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .setLock('pessimistic_write')
      .where('payment.id = :id', { id })
      .getOne();

    if (!payment) {
      throw new NotFoundException('Không tìm thấy phiếu thu/chi');
    }
    return payment;
  }

  /** Khóa dòng chứng từ đích và trả về số tiền + trạng thái đã đọc trong cùng transaction. */
  private async lockTarget(
    manager: EntityManager,
    targetType: AllocationTargetType,
    targetId: string,
  ): Promise<{ id: string; total: string; code: string; status: string }> {
    const meta = TARGET_META[targetType];
    const rows = await manager.query<
      { id: string; total: string; code: string; status: string }[]
    >(
      `SELECT id, total, ${meta.codeColumn} AS code, status FROM ${meta.table} WHERE id = $1 FOR UPDATE`,
      [targetId],
    );

    const target = rows[0];
    if (!target) {
      throw new NotFoundException(
        `Không tìm thấy ${meta.label} để phân bổ`,
      );
    }
    if (target.status !== meta.status) {
      throw new BadRequestException(
        `Chỉ phân bổ được vào ${meta.label} đã ghi sổ (${meta.label} ${target.code} đang ở trạng thái "${target.status}")`,
      );
    }

    return target;
  }

  /** Số chứng từ của các đích, gom theo loại để tra một lượt cho mỗi loại. */
  private async targetCodeMap(
    pairs: readonly [AllocationTargetType, string][],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    for (const targetType of Object.values(AllocationTargetType)) {
      const ids = [
        ...new Set(
          pairs.filter(([type]) => type === targetType).map(([, id]) => id),
        ),
      ];
      if (ids.length === 0) {
        continue;
      }

      const meta = TARGET_META[targetType];
      const rows = await this.dataSource.query<{ id: string; code: string }[]>(
        `SELECT id, ${meta.codeColumn} AS code FROM ${meta.table} WHERE id = ANY($1)`,
        [ids],
      );
      for (const row of rows) {
        map.set(`${targetType}:${row.id}`, row.code);
      }
    }

    return map;
  }
}
