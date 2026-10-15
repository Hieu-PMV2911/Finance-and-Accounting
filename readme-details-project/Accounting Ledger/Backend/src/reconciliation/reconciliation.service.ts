import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  BankMatchStatus,
  BankStatementStatus,
  BankTransactionDirection,
} from '../common/enums/bank-transaction.enum.js';
import { PaymentDirection } from '../common/enums/payment-direction.enum.js';
import { PaymentStatus } from '../common/enums/payment-status.enum.js';
import {
  ReconciliationExceptionStatus,
  ReconciliationExceptionType,
} from '../common/enums/reconciliation-exception.enum.js';import {
  ReconciliationMatchedBy,
  ReconciliationMatchTier,
  ReconciliationTargetType,
} from '../common/enums/reconciliation-target-type.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { compareIsoDates } from '../common/utils/date.util.js';
import { moneyEquals, moneyToString } from '../common/utils/money.util.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { BankStatement } from './entities/bank-statement.entity.js';
import { BankTransaction } from './entities/bank-transaction.entity.js';
import { ReconciliationMatch } from './entities/reconciliation-match.entity.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';

/** Số ngày cho phép lệch ở tầng khớp thứ hai. */
const DEFAULT_DATE_WINDOW_DAYS = Number(process.env.RECONCILIATION_DATE_WINDOW_DAYS ?? 3);

export interface MatchSummary {
  statementId: string;
  lines: number;
  matched: number;
  suggested: number;
  unmatched: number;
  missingStatement: number;
  duplicatePayments: number;
  exceptionsCreated: number;
}

/** Ứng viên nội bộ để khớp với một dòng sao kê. */
interface Candidate {
  payment: Payment;
  /** Tầng khớp tìm ra ứng viên này. */
  tier: ReconciliationMatchTier;
  /** Độ lệch ngày (nhỏ hơn = tốt hơn) — dùng để chọn ứng viên tốt nhất. */
  dateDistance: number;
}

/**
 * **Khớp đối soát** giữa sao kê ngân hàng và chứng từ nội bộ (mục 10.B).
 *
 * Ba tầng khớp, theo đúng thứ tự tin cậy giảm dần:
 * 1. `bankRef`/`reference` trùng **và** số tiền trùng ⇒ khớp chắc chắn.
 * 2. Số tiền trùng và ngày lệch trong ±N ngày ⇒ gợi ý mạnh (cần người xác nhận).
 * 3. Diễn giải chứa mã chứng từ ⇒ gợi ý yếu.
 *
 * Vì sao phải phân tầng thay vì "khớp hết": tầng 2/3 có thể khớp nhầm (hai khoản
 * cùng số tiền, cùng tuần). Tự động chấp nhận chúng là tự tạo ra sổ sách sai mà
 * không ai biết. Tầng 1 mới đủ bằng chứng để tự chốt.
 *
 * Hàm này **không** sinh bút toán: đối soát là lớp kiểm tra, không phải lớp hạch toán.
 * Sai lệch phát hiện được ghi vào danh sách lệch để con người xử lý.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(BankStatement)
    private readonly statements: Repository<BankStatement>,
    @InjectRepository(BankTransaction)
    private readonly transactions: Repository<BankTransaction>,
    @InjectRepository(ReconciliationMatch)
    private readonly matches: Repository<ReconciliationMatch>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly exceptions: ReconciliationExceptionsService,
  ) {}

  // ------------------------------------------------------------- khớp tự động

  async autoMatchStatement(statementId: string): Promise<MatchSummary> {
    const statement = await this.requireStatement(statementId);
    if (statement.status === BankStatementStatus.RECONCILED) {
      throw new BadRequestException(
        'Sao kê đã chốt đối soát — không khớp lại được (bảng đã là bất biến)',
      );
    }

    const lines = await this.transactions.find({
      where: { statementId },
      order: { transactionDate: 'ASC', createdAt: 'ASC' },
    });
    if (lines.length === 0) {
      return this.emptySummary(statementId);
    }

    const candidates = await this.loadCandidates(statement, lines);

    let matched = 0;
    let suggested = 0;
    let unmatched = 0;
    let exceptionsCreated = 0;

    for (const line of lines) {
      // Idempotent: dòng đã khớp và được xác nhận thì không tính lại.
      const existingConfirmed = await this.matches.findOne({
        where: { statementLineId: line.id, matchedBy: ReconciliationMatchedBy.MANUAL },
      });
      const existingAuto = await this.matches.findOne({
        where: { statementLineId: line.id },
      });
      if (existingAuto && line.matchStatus !== BankMatchStatus.UNMATCHED) {
        if (line.matchStatus === BankMatchStatus.MATCHED) matched += 1;
        else suggested += 1;
        continue;
      }
      if (existingConfirmed) {
        matched += 1;
        continue;
      }

      const best = this.pickBestCandidate(line, candidates);
      if (!best) {
        unmatched += 1;
        if (line.matchStatus !== BankMatchStatus.UNMATCHED) {
          line.matchStatus = BankMatchStatus.UNMATCHED;
          await this.transactions.save(line);
        }
        const recorded = await this.exceptions.record({
          type: ReconciliationExceptionType.MISSING_INTERNAL,
          dedupeKey: `missing_internal:${line.id}`,
          statementId,
          statementLineId: line.id,
          amount: line.amount,
          detail:
            `Dòng sao kê ${line.transactionDate} ${line.direction === BankTransactionDirection.IN ? 'tiền vào' : 'tiền ra'} ` +
            `${line.amount} ${line.currency} chưa có chứng từ nội bộ nào khớp. ` +
            `Diễn giải: ${line.description ?? '(không có)'}.`,
        });
        if (recorded.created) exceptionsCreated += 1;
        continue;
      }

      await this.saveMatch({
        statementLineId: line.id,
        targetType: ReconciliationTargetType.PAYMENT,
        targetId: best.payment.id,
        amount: line.amount,
        tier: best.tier,
      });

      const status =
        best.tier === ReconciliationMatchTier.EXACT_REFERENCE
          ? BankMatchStatus.MATCHED
          : BankMatchStatus.SUGGESTED;

      if (status === BankMatchStatus.MATCHED) matched += 1;
      else suggested += 1;

      if (line.matchStatus !== status) {
        line.matchStatus = status;
        await this.transactions.save(line);
      }
    }

    const duplicatePayments = await this.detectDuplicatePayments(statementId);
    const missingStatement = await this.detectMissingInternal(statement, lines);

    statement.lastMatchedAt = new Date();
    statement.lineCount = lines.length;
    await this.statements.save(statement);

    this.logger.log(
      `Đối soát sao kê ${statement.code}: ${matched} khớp, ${suggested} gợi ý, ${unmatched} chưa khớp, ` +
        `${missingStatement} thiếu trên sao kê, ${duplicatePayments} nghi thu trùng`,
    );

    return {
      statementId,
      lines: lines.length,
      matched,
      suggested,
      unmatched,
      missingStatement,
      duplicatePayments,
      exceptionsCreated,
    };
  }

  /** Khớp lại toàn bộ sao kê còn mở — dùng cho cron `reconciliation-catchup`. */
  async catchUp(): Promise<{ statements: number; summary: MatchSummary[] }> {
    const open = await this.statements.find({
      where: { status: BankStatementStatus.DRAFT },
      order: { createdAt: 'ASC' },
    });

    const summary: MatchSummary[] = [];
    for (const statement of open) {
      summary.push(await this.autoMatchStatement(statement.id));
    }
    return { statements: open.length, summary };
  }

  // ------------------------------------------------------------ khớp thủ công

  async confirmMatch(
    input: {
      statementLineId: string;
      targetType: ReconciliationTargetType;
      targetId: string;
      amount?: string;
    },
    actor: AuthUser,
  ): Promise<ReconciliationMatch> {
    const line = await this.transactions.findOne({
      where: { id: input.statementLineId },
    });
    if (!line) {
      throw new NotFoundException('Không tìm thấy dòng sao kê');
    }
    if (line.statementId) {
      const statement = await this.requireStatement(line.statementId);
      if (statement.status === BankStatementStatus.RECONCILED) {
        throw new BadRequestException('Sao kê đã chốt — không thay đổi khớp được');
      }
    }

    const amount = moneyToString(input.amount ?? line.amount);
    const saved = await this.saveMatch({
      statementLineId: input.statementLineId,
      targetType: input.targetType,
      targetId: input.targetId,
      amount,
      tier: null,
      matchedBy: ReconciliationMatchedBy.MANUAL,
      matchedByUserId: actor.id,
      note: 'Người dùng xác nhận khớp',
    });

    line.matchStatus = BankMatchStatus.MATCHED;
    await this.transactions.save(line);

    // Đã khớp thủ công ⇒ dòng lệch "thiếu chứng từ nội bộ" không còn đúng nữa.
    await this.closeMissingInternal(line.id, actor);

    return saved;
  }

  async removeMatch(id: string, actor: AuthUser): Promise<void> {
    const match = await this.matches.findOne({ where: { id } });
    if (!match) {
      throw new NotFoundException('Không tìm thấy dòng khớp');
    }

    await this.matches.remove(match);

    const remaining = await this.matches.count({
      where: { statementLineId: match.statementLineId },
    });
    if (remaining === 0) {
      const line = await this.transactions.findOne({
        where: { id: match.statementLineId },
      });
      if (line) {
        line.matchStatus = BankMatchStatus.UNMATCHED;
        await this.transactions.save(line);
      }
    }
    void actor;
  }

  async listMatches(statementLineId?: string): Promise<ReconciliationMatch[]> {
    if (statementLineId) {
      return this.matches.find({
        where: { statementLineId },
        order: { matchedAt: 'ASC' },
      });
    }
    return this.matches.find({ order: { matchedAt: 'DESC' }, take: 200 });
  }

  // ------------------------------------------------------------------ helpers

  private async requireStatement(id: string): Promise<BankStatement> {
    const statement = await this.statements.findOne({ where: { id } });
    if (!statement) {
      throw new NotFoundException('Không tìm thấy bảng sao kê');
    }
    return statement;
  }

  private emptySummary(statementId: string): MatchSummary {
    return {
      statementId,
      lines: 0,
      matched: 0,
      suggested: 0,
      unmatched: 0,
      missingStatement: 0,
      duplicatePayments: 0,
      exceptionsCreated: 0,
    };
  }

  /**
   * Nạp ứng viên nội bộ: phiếu thu/chi **đã ghi sổ** trên đúng tài khoản tiền,
   * trong khoảng ngày mở rộng ±N ngày quanh phạm vi sao kê.
   *
   * Chỉ lấy phiếu `posted`: phân bổ/đối soát dựa trên bút toán đã thật sự vào sổ
   * (cùng lý do với bất biến của `allocations`).
   */
  private async loadCandidates(
    statement: BankStatement,
    lines: readonly BankTransaction[],
  ): Promise<Payment[]> {
    const dates = lines.map((line) => line.transactionDate).sort(compareIsoDates);
    const from = addDays(dates[0], -DEFAULT_DATE_WINDOW_DAYS);
    const to = addDays(dates[dates.length - 1], DEFAULT_DATE_WINDOW_DAYS);

    return this.payments
      .createQueryBuilder('payment')
      .where('payment.status = :status', { status: PaymentStatus.POSTED })
      .andWhere('payment.cash_account_id = :accountId', {
        accountId: statement.accountId,
      })
      .andWhere('payment.date >= :from AND payment.date <= :to', { from, to })
      .getMany();
  }

  /**
   * Chọn ứng viên tốt nhất cho một dòng sao kê theo thứ tự tầng.
   *
   * Lưu ý nghiệp vụ: **chiều tiền phải khớp** (tiền vào ↔ phiếu thu, tiền ra ↔ phiếu chi).
   * Bỏ qua kiểm tra này sẽ khiến một khoản thu và một khoản chi cùng số tiền "khớp" nhau.
   */
  private pickBestCandidate(
    line: BankTransaction,
    candidates: readonly Payment[],
  ): Candidate | null {
    const expectedDirection =
      line.direction === BankTransactionDirection.IN
        ? PaymentDirection.RECEIPT
        : PaymentDirection.PAYMENT;

    const usable = candidates.filter(
      (payment) =>
        payment.direction === expectedDirection &&
        moneyEquals(payment.amount, line.amount),
    );
    if (usable.length === 0) return null;

    const lineRefs = [line.bankRef, line.reference]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase());

    const withTier: Candidate[] = usable.map((payment) => {
      const distance = dayDistance(payment.date, line.transactionDate);
      const paymentRefs = [payment.reference, payment.code]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase());

      const refHit = lineRefs.some((ref) => paymentRefs.includes(ref));
      if (refHit) {
        return { payment, tier: ReconciliationMatchTier.EXACT_REFERENCE, dateDistance: distance };
      }

      if (distance <= DEFAULT_DATE_WINDOW_DAYS) {
        return { payment, tier: ReconciliationMatchTier.AMOUNT_AND_DATE, dateDistance: distance };
      }

      const description = (line.description ?? '').toLowerCase();
      const mentioned = paymentRefs.some(
        (ref) => ref.length >= 4 && description.includes(ref),
      );
      if (mentioned) {
        return {
          payment,
          tier: ReconciliationMatchTier.FUZZY_DESCRIPTION,
          dateDistance: distance,
        };
      }

      return null;
    }).filter((value): value is Candidate => value !== null);

    if (withTier.length === 0) return null;

    const tierRank: Record<ReconciliationMatchTier, number> = {
      [ReconciliationMatchTier.EXACT_REFERENCE]: 0,
      [ReconciliationMatchTier.AMOUNT_AND_DATE]: 1,
      [ReconciliationMatchTier.FUZZY_DESCRIPTION]: 2,
    };

    withTier.sort(
      (a, b) => tierRank[a.tier] - tierRank[b.tier] || a.dateDistance - b.dateDistance,
    );
    return withTier[0];
  }

  private async saveMatch(input: {
    statementLineId: string;
    targetType: ReconciliationTargetType;
    targetId: string;
    amount: string;
    tier: ReconciliationMatchTier | null;
    matchedBy?: ReconciliationMatchedBy;
    matchedByUserId?: string | null;
    note?: string | null;
  }): Promise<ReconciliationMatch> {
    const existing = await this.matches.findOne({
      where: {
        statementLineId: input.statementLineId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });

    if (existing) {
      existing.amount = input.amount;
      existing.matchTier = input.tier ?? existing.matchTier;
      return this.matches.save(existing);
    }

    return this.matches.save(
      this.matches.create({
        statementLineId: input.statementLineId,
        targetType: input.targetType,
        targetId: input.targetId,
        amount: input.amount,
        matchTier: input.tier,
        matchedBy: input.matchedBy ?? ReconciliationMatchedBy.AUTO,
        matchedByUserId: input.matchedByUserId ?? null,
        note: input.note ?? null,
      }),
    );
  }

  /**
   * Một khoản nội bộ bị **nhiều** dòng sao kê khớp tới ⇒ nghi thu trùng.
   *
   * Không tự sửa: nếu tự động gỡ bớt khớp thì ta vừa che mất dấu hiệu gian lận/lỗi
   * vừa có thể gỡ nhầm dòng đúng. Ghi lệch để con người quyết định.
   */
  private async detectDuplicatePayments(statementId: string): Promise<number> {
    const lines = await this.transactions.find({ where: { statementId } });
    const lineIds = lines.map((line) => line.id);
    if (lineIds.length === 0) return 0;

    const rows = await this.matches
      .createQueryBuilder('m')
      .select('m.target_id', 'targetId')
      .addSelect('COUNT(*)', 'count')
      .where('m.statement_line_id IN (:...lineIds)', { lineIds })
      .andWhere('m.target_type = :targetType', {
        targetType: ReconciliationTargetType.PAYMENT,
      })
      .groupBy('m.target_id')
      .having('COUNT(*) > 1')
      .getRawMany<{ targetId: string; count: string }>();

    let created = 0;
    for (const row of rows) {
      const recorded = await this.exceptions.record({
        type: ReconciliationExceptionType.DUPLICATE_PAYMENT,
        dedupeKey: `duplicate_payment:${row.targetId}`,
        statementId,
        targetType: ReconciliationTargetType.PAYMENT,
        targetId: row.targetId,
        detail:
          `Chứng từ nội bộ ${row.targetId} đang được ${row.count} dòng sao kê khớp tới — ` +
          'nghi thu/chi trùng, cần kiểm tra thủ công.',
      });
      if (recorded.created) created += 1;
    }
    return created;
  }

  /**
   * Chứng từ nội bộ **đã ghi sổ** trong phạm vi sao kê nhưng không xuất hiện trên
   * sao kê ⇒ ghi lệch `missing_statement`.
   *
   * Đây là nửa còn lại của đối soát: chỉ tìm "sao kê có gì mà sổ không có" là chưa đủ.
   */
  private async detectMissingInternal(
    statement: BankStatement,
    lines: readonly BankTransaction[],
  ): Promise<number> {
    if (lines.length === 0) return 0;

    const dates = lines.map((line) => line.transactionDate).sort(compareIsoDates);
    const from = dates[0];
    const to = dates[dates.length - 1];

    const internal = await this.payments
      .createQueryBuilder('payment')
      .where('payment.status = :status', { status: PaymentStatus.POSTED })
      .andWhere('payment.cash_account_id = :accountId', {
        accountId: statement.accountId,
      })
      .andWhere('payment.date >= :from AND payment.date <= :to', { from, to })
      .getMany();
    if (internal.length === 0) return 0;

    const matchedTargetIds = new Set(
      (
        await this.matches.find({
          where: {
            targetType: ReconciliationTargetType.PAYMENT,
            targetId: In(internal.map((payment) => payment.id)),
          },
        })
      ).map((match) => match.targetId),
    );

    let created = 0;
    for (const payment of internal) {
      if (matchedTargetIds.has(payment.id)) continue;

      const recorded = await this.exceptions.record({
        type: ReconciliationExceptionType.MISSING_STATEMENT,
        dedupeKey: `missing_statement:${payment.id}`,
        statementId: statement.id,
        targetType: ReconciliationTargetType.PAYMENT,
        targetId: payment.id,
        amount: payment.amount,
        detail:
          `Phiếu ${payment.code} (${payment.date}, ${payment.amount} ${payment.currency ?? ''}) ` +
          `đã ghi sổ nhưng không có dòng sao kê nào khớp trong kỳ ${from} → ${to}.`,
      });
      if (recorded.created) created += 1;
    }
    return created;
  }

  private async closeMissingInternal(
    statementLineId: string,
    actor: AuthUser,
  ): Promise<void> {
    const pending = await this.exceptions.findOpenByStatementLine(statementLineId);
    for (const exception of pending) {
      if (exception.type !== ReconciliationExceptionType.MISSING_INTERNAL) continue;
      await this.exceptions.resolve(
        exception.id,
        {
          status: ReconciliationExceptionStatus.RESOLVED,
          note: 'Đã khớp thủ công với chứng từ nội bộ',
        },
        actor,
      );
    }
  }
}

/** Khoảng cách ngày (tuyệt đối) giữa hai chuỗi `YYYY-MM-DD`. */
function dayDistance(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  return Math.round(Math.abs(first - second) / 86_400_000);
}

/** Cộng/trừ ngày trên chuỗi `YYYY-MM-DD`. */
function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
