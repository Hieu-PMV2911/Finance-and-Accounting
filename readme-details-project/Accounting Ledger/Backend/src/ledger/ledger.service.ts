import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Decimal } from 'decimal.js';
import { type EntityManager, Repository } from 'typeorm';

import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { AccountBalance } from './entities/account-balance.entity.js';
import type {
  AccountBalanceView,
  LedgerMovement,
} from './interfaces/account-balance-view.interface.js';
import { netBalanceOf, splitNet } from './ledger-balance.util.js';

/**
 * Sổ số dư — nguồn sự thật cho số dư đầu kỳ / phát sinh / cuối kỳ của từng tài khoản.
 *
 * Mọi thao tác **ghi** đều nhận `EntityManager` để chạy chung transaction với bút
 * toán, và dùng khóa bi quan (`SELECT ... FOR UPDATE`) trên dòng số dư để chống
 * mất cập nhật khi nhiều người ghi sổ đồng thời.
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(AccountBalance)
    private readonly balances: Repository<AccountBalance>,
  ) {}

  /**
   * Cộng (hoặc trừ, khi `sign = -1`) phát sinh Nợ/Có vào số dư của kỳ.
   *
   * Các dòng cùng một tài khoản được gộp trước khi cập nhật để mỗi tài khoản chỉ
   * bị khóa đúng một lần.
   */
  async applyMovements(
    manager: EntityManager,
    periodId: string,
    movements: readonly LedgerMovement[],
    sign: 1 | -1 = 1,
  ): Promise<void> {
    const deltas = new Map<string, { debit: Decimal; credit: Decimal }>();

    for (const movement of movements) {
      const current = deltas.get(movement.accountId) ?? {
        debit: toMoney(0),
        credit: toMoney(0),
      };
      current.debit = current.debit.plus(toMoney(movement.debit));
      current.credit = current.credit.plus(toMoney(movement.credit));
      deltas.set(movement.accountId, current);
    }

    for (const [accountId, delta] of deltas) {
      const balance = await this.lockOrCreate(manager, accountId, periodId);
      balance.debitTotal = moneyToString(
        toMoney(balance.debitTotal).plus(delta.debit.times(sign)),
      );
      balance.creditTotal = moneyToString(
        toMoney(balance.creditTotal).plus(delta.credit.times(sign)),
      );
      await manager.save(AccountBalance, balance);
    }
  }

  /**
   * Chốt số dư cuối kỳ của `fromPeriodId` thành số dư đầu kỳ của `toPeriodId`.
   *
   * Ghi **đè** (không cộng dồn) nên gọi lại nhiều lần vẫn cho cùng kết quả.
   * Trả về số tài khoản đã được chuyển số dư.
   */
  async carryForwardOpening(
    manager: EntityManager,
    fromPeriodId: string,
    toPeriodId: string,
  ): Promise<number> {
    const sources = await manager.find(AccountBalance, {
      where: { periodId: fromPeriodId },
    });

    let carried = 0;
    for (const source of sources) {
      // Số dư thuần (Nợ trừ Có) — xem `netBalanceOf`.
      const net = netBalanceOf(source);

      // Tài khoản không còn số dư ⇒ không cần tạo dòng ở kỳ sau.
      if (net.isZero()) {
        continue;
      }

      const { debit, credit } = splitNet(net);

      const target = await this.lockOrCreate(
        manager,
        source.accountId,
        toPeriodId,
      );
      target.openingDebit = debit;
      target.openingCredit = credit;
      await manager.save(AccountBalance, target);
      carried += 1;
    }

    return carried;
  }

  /** Số dư của toàn bộ tài khoản trong một kỳ (sắp theo mã tài khoản). */
  async listByPeriod(periodId: string): Promise<AccountBalanceView[]> {
    const rows = await this.balances.find({
      where: { periodId },
      relations: { account: true },
    });

    return rows
      .map((row) => {
        const { debit, credit } = splitNet(netBalanceOf(row));

        return {
          accountId: row.accountId,
          accountCode: row.account?.code ?? '',
          accountName: row.account?.name ?? '',
          accountType: row.account?.type,
          openingDebit: moneyToString(row.openingDebit),
          openingCredit: moneyToString(row.openingCredit),
          debitTotal: moneyToString(row.debitTotal),
          creditTotal: moneyToString(row.creditTotal),
          closingDebit: debit,
          closingCredit: credit,
        };
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Lấy dòng số dư kèm khóa bi quan, tạo mới nếu chưa có.
   *
   * Dùng `INSERT ... ON CONFLICT DO NOTHING` thay vì "find rồi create": nếu hai
   * transaction cùng tạo dòng mới, cách kia sẽ vi phạm ràng buộc duy nhất và làm
   * hỏng cả transaction (Postgres abort transaction sau lỗi statement).
   */
  private async lockOrCreate(
    manager: EntityManager,
    accountId: string,
    periodId: string,
  ): Promise<AccountBalance> {
    await manager.query(
      `INSERT INTO account_balances (account_id, period_id)
       VALUES ($1, $2)
       ON CONFLICT (account_id, period_id) DO NOTHING`,
      [accountId, periodId],
    );

    const balance = await manager.findOne(AccountBalance, {
      where: { accountId, periodId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!balance) {
      // Không xảy ra trong thực tế: INSERT ở trên bảo đảm dòng tồn tại.
      throw new Error(
        `Không tạo được dòng số dư cho tài khoản ${accountId} kỳ ${periodId}`,
      );
    }

    return balance;
  }
}
