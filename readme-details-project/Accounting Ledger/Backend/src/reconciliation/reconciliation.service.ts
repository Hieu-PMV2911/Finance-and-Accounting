import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import {
  PaymentDirection,
} from '../common/enums/payment-direction.enum.js';
import { SourceType } from '../common/enums/source-type.enum.js';
import {
  moneyToString,
  toMoney,
} from '../common/utils/money.util.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import type { CreateJournalLineDto } from '../journals/dto/create-journal-line.dto.js';
import { JournalsService } from '../journals/journals.service.js';
import { ReconciliationRegistry } from '../jobs/reconciliation-registry.js';
import { PaymentsService } from '../payments/payments.service.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { BankApiStatementAdapter } from './adapters/bank-api-statement.adapter.js';
import { CsvJsonStatementAdapter } from './adapters/csv-json-statement.adapter.js';
import {
  matchTransaction,
  type MatchCandidate,
  type MatchTransaction,
} from './bank-match.util.js';
import type {
  ConfirmMatchDto,
  CreateBankAdjustmentDto,
  QueryBankStatementsDto,
  QueryBankTransactionsDto,
  QueryMatchesDto,
} from './dto/query-reconciliation.dto.js';
import type { IngestStatementDto } from './dto/ingest-statement.dto.js';
import { BankStatement } from './entities/bank-statement.entity.js';
import { BankTransaction } from './entities/bank-transaction.entity.js';
import { ReconciliationMatch } from './entities/reconciliation-match.entity.js';
import {
  BankStatementStatus,
  isStatementImmutable,
} from './enums/bank-statement-status.enum.js';
import {
  BankTransactionDirection,
  BankTransactionSource,
  ReconciliationMatchStatus,
  ReconciliationMatchTargetType,
  ReconciliationMatchTier,
} from './enums/bank-transaction.enum.js';
import type { NormalizedBankTransaction } from './interfaces/statement-source-adapter.interface.js';
import { ReconciliationExceptionsService } from '../payment-intents/reconciliation-exceptions.service.js';
import { ReconciliationExceptionType } from '../payment-intents/enums/reconciliation-exception.enum.js';

/** Chữ ký hành động cho vết kiểm toán khi tạo bút toán phí/lãi. */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Đối soát ngân hàng (mục 10.B — P2.2/P2.3).
 *
 * **Một pipeline cho mọi nguồn**: adapter nào (`file` CSV/JSON hay `api`) cũng
 * đưa về cùng `NormalizedBankTransaction[]`, rồi đi qua chung một chuỗi
 * normalize → chống trùng → khớp → ghi ngoại lệ. Parser không chứa logic khớp;
 * logic khớp không biết dữ liệu đến từ đâu.
 *
 * Bất biến:
 * - Chống trùng theo `(accountId, bankRef, amount, transactionDate)` — nạp lại
 *   cùng file không tạo dòng thứ hai.
 * - Khớp **3 tầng** (tham chiếu · tiền+ngày · gợi ý mờ); tầng 3 chỉ là gợi ý,
 *   phải có người xác nhận.
 * - Chỗ không khớp ⇒ **ngoại lệ đối soát** cho con người, không tự đoán.
 * - Sao kê chốt (`reconciled`) là bất biến: mọi dòng phải khớp hết.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(BankStatement)
    private readonly statements: Repository<BankStatement>,
    @InjectRepository(BankTransaction)
    private readonly transactions: Repository<BankTransaction>,
    @InjectRepository(ReconciliationMatch)
    private readonly matches: Repository<ReconciliationMatch>,
    private readonly accounts: AccountsService,
    private readonly periods: FiscalPeriodsService,
    private readonly journals: JournalsService,
    private readonly payments: PaymentsService,
    private readonly exceptions: ReconciliationExceptionsService,
    private readonly registry: ReconciliationRegistry,
    private readonly fileAdapter: CsvJsonStatementAdapter,
    private readonly apiAdapter: BankApiStatementAdapter,
  ) {}

  onModuleInit(): void {
    // Worker `statements` gọi nghiệp vụ qua registry để `JobsModule` không phải
    // import ngược module này (cùng lý do với `PaymentPollRegistry`).
    this.registry.register({
      importStatement: (input) =>
        this.importStatement(input as never, SYSTEM_ACTOR_ID),
      reconcileStatement: (id) => this.reconcileStatement(id),
      catchup: (limit) => this.catchup(limit),
    });
  }

  // --------------------------------------------------------------- đọc

  async listStatements(
    query: QueryBankStatementsDto = {},
  ): Promise<BankStatement[]> {
    const qb = this.statements
      .createQueryBuilder('statement')
      .leftJoinAndSelect('statement.account', 'account')
      .orderBy('statement.statementDate', 'DESC');

    if (query.accountId) {
      qb.andWhere('statement.accountId = :accountId', {
        accountId: query.accountId,
      });
    }
    if (query.status) {
      qb.andWhere('statement.status = :status', { status: query.status });
    }
    return qb.take(query.limit ?? 100).getMany();
  }

  async findStatementById(id: string): Promise<BankStatement> {
    const statement = await this.statements.findOne({
      where: { id },
      relations: { account: true },
    });
    if (!statement) {
      throw new NotFoundException('Không tìm thấy sao kê');
    }
    return statement;
  }

  async listTransactions(
    query: QueryBankTransactionsDto = {},
  ): Promise<BankTransaction[]> {
    const qb = this.transactions
      .createQueryBuilder('transaction')
      .orderBy('transaction.transactionDate', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC');

    if (query.statementId) {
      qb.andWhere('transaction.statementId = :statementId', {
        statementId: query.statementId,
      });
    }
    if (query.matchStatus) {
      qb.andWhere('transaction.matchStatus = :matchStatus', {
        matchStatus: query.matchStatus,
      });
    }
    if (query.direction) {
      qb.andWhere('transaction.direction = :direction', {
        direction: query.direction,
      });
    }
    if (query.fromDate) {
      qb.andWhere('transaction.transactionDate >= :fromDate', {
        fromDate: query.fromDate,
      });
    }
    if (query.toDate) {
      qb.andWhere('transaction.transactionDate <= :toDate', {
        toDate: query.toDate,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(transaction.bankRef ILIKE :s OR transaction.reference ILIKE :s OR transaction.description ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.take(query.limit ?? 200).getMany();
  }

  async listMatches(query: QueryMatchesDto = {}): Promise<ReconciliationMatch[]> {
    const qb = this.matches
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.transaction', 'transaction')
      .orderBy('match.matchedAt', 'DESC');

    if (query.targetType) {
      qb.andWhere('match.targetType = :targetType', {
        targetType: query.targetType,
      });
    }
    if (query.targetId) {
      qb.andWhere('match.targetId = :targetId', { targetId: query.targetId });
    }
    return qb.take(query.limit ?? 200).getMany();
  }

  // -------------------------------------------------------------- nạp

  /**
   * Nạp một lô sao kê (chạy trong job `statements`).
   *
   * Adapter được chọn theo `source`; **sau đó** mọi thứ là chung một pipeline.
   * Nạp lại cùng file là no-op (chống trùng theo khóa nghiệp vụ) — trả về số
   * dòng đã có, không tạo dòng mới.
   */
  async importStatement(
    dto: IngestStatementDto,
    actorId: string,
  ): Promise<{
    statementId: string;
    code: string;
    imported: number;
    skipped: number;
  }> {
    const adapter = this.adapterFor(dto.source ?? BankTransactionSource.FILE);
    const normalized = adapter.parse({
      content: dto.content,
      accountId: dto.accountId,
    });

    if (normalized.length === 0) {
      throw new BadRequestException('Sao kê không có dòng dữ liệu nào');
    }

    await this.accounts.getPostable(dto.accountId);
    const statementDate =
      dto.statementDate ??
      normalized.reduce(
        (latest, row) => (row.transactionDate > latest ? row.transactionDate : latest),
        normalized[0].transactionDate,
      );

    const statement = this.statements.create({
      code: await this.nextStatementCode(),
      accountId: dto.accountId,
      statementDate,
      openingBalance: moneyToString(dto.openingBalance ?? 0),
      closingBalance: moneyToString(dto.closingBalance ?? 0),
      status: BankStatementStatus.IMPORTED,
      sourceRef: dto.sourceRef ?? null,
      createdBy: actorId,
    });
    const savedStatement = await this.statements.save(statement);

    let imported = 0;
    let skipped = 0;

    for (const row of normalized) {
      const duplicate = await this.findDuplicate(dto.accountId, row);
      if (duplicate) {
        skipped += 1;
        continue;
      }

      const transaction = this.transactions.create({
        statementId: savedStatement.id,
        accountId: dto.accountId,
        transactionDate: row.transactionDate,
        valueDate: row.valueDate,
        description: row.description,
        reference: row.reference,
        bankRef: row.bankRef,
        direction: row.direction,
        amount: row.amount,
        currency: row.currency,
        source: dto.source ?? BankTransactionSource.FILE,
        sourceRef: dto.sourceRef ?? null,
        raw: row.raw,
        matchStatus: ReconciliationMatchStatus.UNMATCHED,
      });
      try {
        await this.transactions.save(transaction);
        imported += 1;
      } catch (error) {
        // Hai tiến trình nạp cùng dòng ⇒ khóa unique thắng; tính là trùng.
        if (/duplicate key| unique/i.test(String(error))) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    this.logger.log(
      `Đã nạp sao kê ${savedStatement.code}: ${imported} dòng mới, ${skipped} dòng trùng`,
    );

    return {
      statementId: savedStatement.id,
      code: savedStatement.code,
      imported,
      skipped,
    };
  }

  // ------------------------------------------------------------ đối soát

  /**
   * Chạy pipeline đối soát cho **một** sao kê.
   *
   * Mỗi dòng chưa khớp được thử 3 tầng; tầng nào cũng trượt thì ghi ngoại lệ
   * `missing_internal`. Sau đó, mọi phiếu thu/chi đã ghi sổ **không** có dòng
   * sao nào khớp ⇒ ngoại lệ `missing_statement` (sổ có mà ngân hàng không).
   */
  async reconcileStatement(statementId: string): Promise<{
    statementId: string;
    matched: number;
    suggested: number;
    unmatched: number;
    missingStatement: number;
  }> {
    const statement = await this.findStatementById(statementId);
    if (isStatementImmutable(statement.status)) {
      throw new BadRequestException(
        'Sao kê đã được chốt đối soát — không chạy lại được',
      );
    }

    const transactions = await this.transactions.find({
      where: {
        statementId,
        matchStatus: In([
          ReconciliationMatchStatus.UNMATCHED,
          ReconciliationMatchStatus.SUGGESTED,
        ]),
      },
      order: { transactionDate: 'ASC' },
    });

    const matchedTargets = new Set<string>();
    const existingMatches = await this.matches.find({
      where: { transactionId: In(transactions.map((t) => t.id)) },
    });
    for (const match of existingMatches) {
      matchedTargets.add(`${match.targetType}:${match.targetId}`);
    }

    let matched = 0;
    let suggested = 0;
    let unmatched = 0;

    for (const transaction of transactions) {
      const candidates = await this.candidatesFor(
        transaction,
        matchedTargets,
      );
      const outcome = matchTransaction(
        this.toMatchTransaction(transaction),
        candidates,
      );

      if (outcome.tier && outcome.candidateId) {
        const target = candidates.find((c) => c.id === outcome.candidateId);
        if (!target) continue;

        if (outcome.tier === ReconciliationMatchTier.FUZZY) {
          // Tầng 3 chỉ là **gợi ý** — để con người xác nhận, không tự chốt.
          transaction.matchStatus = ReconciliationMatchStatus.SUGGESTED;
          await this.transactions.save(transaction);
          suggested += 1;
          continue;
        }

        await this.saveMatch(
          transaction,
          target.targetType,
          target.id,
          outcome.amount,
          outcome.tier,
          null,
        );
        matchedTargets.add(`${target.targetType}:${target.id}`);
        matched += 1;
        continue;
      }

      // Không tầng nào khớp — ghi ngoại lệ (chống trùng theo dòng).
      await this.exceptions.create({
        type: ReconciliationExceptionType.MISSING_INTERNAL,
        externalRef: transaction.id,
        detail: {
          statementCode: statement.code,
          transactionDate: transaction.transactionDate,
          bankRef: transaction.bankRef,
          direction: transaction.direction,
          amount: transaction.amount,
          description: transaction.description,
        },
      });
      unmatched += 1;
    }

    const missingStatement = await this.flagMissingStatement(
      statement,
      matchedTargets,
    );

    return {
      statementId,
      matched,
      suggested,
      unmatched,
      missingStatement,
    };
  }

  /**
   * **Đối soát bù** — thân của cron `reconciliation-catchup` (hằng ngày).
   *
   * Quét các sao kê còn `imported` và chạy pipeline trên từng cái. Mục đích:
   * khi dòng mới được nạp hoặc phiếu mới được ghi sổ mà chưa bấm đối soát thủ
   * công, cron tự bắt kịp. Không có gì để đối soát thì **không** làm gì —
   * đúng nguyên tắc "im lặng khi mọi thứ bình thường".
   */
  async catchup(limit = 50): Promise<{ statementsReconciled: number; totalMatched: number; totalUnmatched: number }> {
    const open = await this.statements.find({
      where: { status: BankStatementStatus.IMPORTED },
      order: { statementDate: 'ASC' },
      take: limit,
    });

    let statementsReconciled = 0;
    let totalMatched = 0;
    let totalUnmatched = 0;

    for (const statement of open) {
      try {
        const result = await this.reconcileStatement(statement.id);
        statementsReconciled += 1;
        totalMatched += result.matched + result.suggested;
        totalUnmatched += result.unmatched;
      } catch (error) {
        this.logger.error(
          `Đối soát bù sao kê ${statement.code} thất bại: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { statementsReconciled, totalMatched, totalUnmatched };
  }

  /**
   * Chốt sao kê — **bất biến**. Chỉ cho chốt khi mọi dòng đều `matched`
   * (gợi ý mờ phải được người xác nhận trước, không được chốt với gợi ý treo).
   */
  async resolveStatement(id: string, actorId: string): Promise<BankStatement> {
    const statement = await this.findStatementById(id);

    if (isStatementImmutable(statement.status)) {
      return statement;
    }

    const open = await this.transactions.count({
      where: {
        statementId: id,
        matchStatus: In([
          ReconciliationMatchStatus.UNMATCHED,
          ReconciliationMatchStatus.SUGGESTED,
        ]),
      },
    });
    if (open > 0) {
      throw new ConflictException(
        `Còn ${open} dòng chưa khớp (hoặc chỉ là gợi ý) — xác nhận trước khi chốt đối soát`,
      );
    }

    // Kiểm tra số dư: Σ vào − Σ ra + đầu kỳ phải bằng cuối kỳ (nếu khai đủ).
    await this.assertBalance(statement);

    statement.status = BankStatementStatus.RECONCILED;
    const saved = await this.statements.save(statement);
    this.logger.log(`Sao kê ${statement.code} đã chốt đối soát (${actorId})`);
    return this.findStatementById(saved.id);
  }

  // ------------------------------------------------------------ thủ công

  /**
   * Xác nhận một dòng khớp (người bấm "Khớp" trên gợi ý, hoặc ghép tay).
   *
   * Ghi `manual` để vết kiểm toán phân biệt người quyết định với hệ thống. Số
   * tiền khác số tiền dòng sao ⇒ bắt buộc có ghi chú.
   */
  async confirmMatch(
    transactionId: string,
    dto: ConfirmMatchDto,
    actorId: string,
  ): Promise<ReconciliationMatch> {
    const transaction = await this.findTransactionById(transactionId);

    if (transaction.matchStatus === ReconciliationMatchStatus.MATCHED) {
      throw new BadRequestException('Dòng sao này đã được khớp trước đó');
    }

    const amount = moneyToString(dto.amount ?? transaction.amount);
    if (toMoney(amount).greaterThan(transaction.amount)) {
      throw new BadRequestException(
        'Số tiền khớp không được lớn hơn số tiền dòng sao kê',
      );
    }
    if (!toMoney(amount).greaterThan(0)) {
      throw new BadRequestException('Số tiền khớp phải lớn hơn 0');
    }

    if (moneyToString(amount) !== moneyToString(transaction.amount) && !dto.note?.trim()) {
      throw new BadRequestException(
        'Số tiền khớp khác số tiền dòng sao — bắt buộc nhập ghi chú giải thích',
      );
    }

    await this.assertTargetExists(dto.targetType, dto.targetId);

    return this.saveMatch(
      transaction,
      dto.targetType,
      dto.targetId,
      amount,
      ReconciliationMatchTier.MANUAL,
      dto.note?.trim() || null,
      actorId,
    );
  }

  /** Gỡ một dòng khớp — luôn để lại lý do trong `note`. */
  async unmatch(matchId: string, reason: string | null, actorId: string): Promise<void> {
    const match = await this.matches.findOne({ where: { id: matchId } });
    if (!match) {
      throw new NotFoundException('Không tìm thấy dòng khớp');
    }

    const transaction = await this.findTransactionById(match.transactionId);
    await this.matches.delete(matchId);

    transaction.matchStatus =
      await this.matches.count({ where: { transactionId: transaction.id } }) > 0
        ? ReconciliationMatchStatus.MATCHED
        : ReconciliationMatchStatus.UNMATCHED;
    await this.transactions.save(transaction);

    this.logger.log(
      `Đã gỡ dòng khớp ${matchId} của dòng sao ${transaction.id} (${actorId}): ${reason ?? 'không rõ lý do'}`,
    );
  }

  /**
   * Tạo bút toán **phí / lãi ngân hàng** cho một dòng sao chưa khớp.
   *
   * Dùng cho trường hợp dòng sao thật nhưng nội bộ không có chứng từ nào:
   * phí chuyển khoản, lãi tiết kiệm… Bút toán đi qua `JournalsService` như mọi
   * chứng từ khác, `source_type = bank_transaction`.
   */
  async createBankAdjustment(
    transactionId: string,
    dto: CreateBankAdjustmentDto,
    actorId: string,
  ): Promise<{ journalEntryId: string; match: ReconciliationMatch }> {
    const transaction = await this.findTransactionById(transactionId);

    if (transaction.matchStatus === ReconciliationMatchStatus.MATCHED) {
      throw new BadRequestException('Dòng sao đã có đối ứng — không tạo bút toán được');
    }

    const period = await this.periods.resolveByDate(transaction.transactionDate);
    this.periods.assertAcceptsPostings(period);

    const moneyAccount = await this.accounts.getPostable(transaction.accountId);
    const isInterest = transaction.direction === BankTransactionDirection.IN;

    // Phí/lãi ngân hàng ghi vào tài khoản **642 hoặc 635 tùy nghiệp vụ**; ở đây
    // chọn theo chiều: tiền ra ⇒ chi phí (Nợ 642/635 · Có tiền), tiền vào ⇒ doanh
    // thu tài chính (Nợ tiền · Có 635). Người dùng có thể đổi tài khoản sau.
    const adjustmentAccount = await this.accounts.requirePostableByCodePrefix(
      isInterest ? '635' : '642',
      isInterest
        ? 'thu nhập tài chính (635*)'
        : 'chi phí tài chính / ngân hàng (642*)',
    );

    const description =
      dto.description?.trim() ||
      transaction.description ||
      `Điều chỉnh sao kê ${transaction.reference ?? transaction.bankRef ?? transaction.id}`;
    const amount = moneyToString(transaction.amount);

    const lines: CreateJournalLineDto[] = isInterest
      ? [
          { accountId: moneyAccount.id, debit: amount, description },
          { accountId: adjustmentAccount.id, credit: amount, description },
        ]
      : [
          { accountId: adjustmentAccount.id, debit: amount, description },
          { accountId: moneyAccount.id, credit: amount, description },
        ];

    const posted = await this.journals.postDocument(
      {
        date: transaction.transactionDate,
        description,
        reference: transaction.reference ?? transaction.bankRef ?? undefined,
        sourceType: SourceType.BANK_TRANSACTION,
        sourceId: transaction.id,
        lines,
      },
      actorId,
      async () => {
        // Cập nhật trạng thái dòng sao **trong cùng transaction** với bút toán:
        // không có bút toán đã ghi mà dòng sao còn `unmatched`.
        transaction.matchStatus = ReconciliationMatchStatus.MATCHED;
        await this.transactions.save(transaction);
      },
    );

    const match = await this.saveMatch(
      transaction,
      ReconciliationMatchTargetType.JOURNAL_ENTRY,
      posted.id,
      amount,
      ReconciliationMatchTier.MANUAL,
      description,
      actorId,
    );

    this.logger.log(
      `Đã tạo bút toán điều chỉnh ${posted.id} cho dòng sao ${transaction.id}`,
    );
    return { journalEntryId: posted.id, match };
  }

  // ------------------------------------------------------------- nội bộ

  /**
   * Ứng viên nội bộ để khớp một dòng sao: **phiếu thu/chi đã ghi sổ** có cùng
   * chiều tiền. Câu trả lời cho "dòng này khớp chứng từ nào?" luôn lấy từ sổ
   * cái — không đoán.
   */
  private async candidatesFor(
    transaction: BankTransaction,
    matchedTargets: Set<string>,
  ): Promise<(MatchCandidate & { targetType: ReconciliationMatchTargetType })[]> {
    const direction =
      transaction.direction === BankTransactionDirection.IN
        ? PaymentDirection.RECEIPT
        : PaymentDirection.PAYMENT;

    // Lấy phiếu theo khoảng ngày ±30 quanh dòng sao — đủ rộng để tầng 2 tìm
    // thấy, hẹp để không quét cả nghìn phiếu mỗi dòng.
    const windowStart = shiftDays(transaction.transactionDate, -30);
    const windowEnd = shiftDays(transaction.transactionDate, 30);

    const payments = (await this.payments.list({
      direction,
      status: 'posted' as never,
      fromDate: windowStart,
      toDate: windowEnd,
    })) as Payment[];

    return payments
      .slice(0, 500)
      .filter((payment: Payment) => !matchedTargets.has(`payment:${payment.id}`))
      .map((payment: Payment) => ({
        id: payment.id,
        code: payment.code,
        reference: payment.reference ?? null,
        amount: payment.amount,
        date: payment.date,
        direction: transaction.direction,
        targetType: ReconciliationMatchTargetType.PAYMENT,
      }));
  }

  /** Đánh dấu phiếu đã ghi sổ nhưng không có dòng sao nào khớp (thiếu sao kê). */
  private async flagMissingStatement(
    statement: BankStatement,
    matchedTargets: Set<string>,
  ): Promise<number> {
    const payments = (await this.payments.list({
      status: 'posted' as never,
    })) as Payment[];

    let flagged = 0;
    for (const payment of payments.slice(0, 500)) {
      if (matchedTargets.has(`payment:${payment.id}`)) continue;

      await this.exceptions.create({
        type: ReconciliationExceptionType.MISSING_STATEMENT,
        externalRef: payment.id,
        detail: {
          statementCode: statement.code,
          paymentCode: payment.code,
          amount: payment.amount,
          date: payment.date,
          direction: payment.direction,
        },
      });
      flagged += 1;
    }
    return flagged;
  }

  private async saveMatch(
    transaction: BankTransaction,
    targetType: ReconciliationMatchTargetType,
    targetId: string,
    amount: string,
    tier: ReconciliationMatchTier,
    note: string | null,
    matchedBy?: string,
  ): Promise<ReconciliationMatch> {
    const existing = await this.matches.findOne({
      where: { transactionId: transaction.id, targetType, targetId },
    });
    if (existing) return existing;

    const match = this.matches.create({
      transactionId: transaction.id,
      targetType,
      targetId,
      amount,
      matchedByTier: tier,
      matchedBy: matchedBy ?? null,
      matchedAt: new Date(),
      note,
    });
    const saved = await this.matches.save(match);

    transaction.matchStatus = ReconciliationMatchStatus.MATCHED;
    await this.transactions.save(transaction);

    return saved;
  }

  private async findTransactionById(id: string): Promise<BankTransaction> {
    const transaction = await this.transactions.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException('Không tìm thấy dòng sao kê');
    }
    return transaction;
  }

  private async assertTargetExists(
    targetType: ReconciliationMatchTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === ReconciliationMatchTargetType.PAYMENT) {
      await this.payments.findById(targetId);
      return;
    }
    const entry = await this.journals.findById(targetId);
    if (!entry) {
      throw new NotFoundException('Không tìm thấy bút toán đối chiếu');
    }
  }

  /** Số dư cuối phải khớp số đầu + Σ vào − Σ ra (khi cả ba được khai). */
  private async assertBalance(statement: BankStatement): Promise<void> {
    const rows = await this.transactions.find({
      where: { statementId: statement.id },
    });
    if (rows.length === 0) return;

    const net = rows.reduce((acc, row) => {
      const amount = toMoney(row.amount);
      return row.direction === BankTransactionDirection.IN
        ? acc.plus(amount)
        : acc.minus(amount);
    }, toMoney(0));

    const expected = toMoney(statement.openingBalance).plus(net);
    if (!toMoney(statement.closingBalance).isZero()) {
      if (!expected.equals(toMoney(statement.closingBalance))) {
        throw new ConflictException(
          `Số dư cuối (${statement.closingBalance}) không khớp số đầu + phát sinh (${expected.toFixed(4)}) — kiểm tra sao kê thiếu dòng`,
        );
      }
    }
  }

  private adapterFor(source: BankTransactionSource): CsvJsonStatementAdapter | BankApiStatementAdapter {
    return source === BankTransactionSource.API
      ? this.apiAdapter
      : this.fileAdapter;
  }

  private toMatchTransaction(transaction: BankTransaction): MatchTransaction {
    return {
      id: transaction.id,
      bankRef: transaction.bankRef,
      reference: transaction.reference,
      amount: transaction.amount,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      direction: transaction.direction,
    };
  }

  private async findDuplicate(
    accountId: string,
    row: NormalizedBankTransaction,
  ): Promise<BankTransaction | null> {
    return this.transactions.findOne({
      where: {
        accountId,
        transactionDate: row.transactionDate,
        amount: row.amount,
        direction: row.direction,
        ...(row.bankRef ? { bankRef: row.bankRef } : {}),
      },
    });
  }

  private async nextStatementCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `ST-${Date.now().toString(36).toUpperCase()}-${attempt}`;
      if (!(await this.statements.exists({ where: { code } }))) return code;
    }
    throw new ConflictException('Không sinh được mã sao kê — thử lại');
  }
}

/** Trả về ngày ISO ±N ngày (để quét cửa sổ mà không cần thư viện ngày tháng). */
function shiftDays(isoDate: string, days: number): string {
  const base = Date.parse(`${isoDate}T00:00:00Z`);
  const shifted = new Date(base + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}
