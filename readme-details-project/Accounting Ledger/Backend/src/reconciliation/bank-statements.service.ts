import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import {
  BankMatchStatus,
  BankStatementStatus,
  BankTransactionSource,
} from '../common/enums/bank-transaction.enum.js';
import { ReconciliationExceptionStatus } from '../common/enums/reconciliation-exception.enum.js';
import type { AuthUser } from '../common/interfaces/auth-user.interface.js';
import { moneyToString } from '../common/utils/money.util.js';
import { JobName, JobQueue, JobTrigger } from '../jobs/enums/job.enum.js';
import type { JobRun } from '../jobs/entities/job-run.entity.js';
import { QueueService } from '../jobs/queue.service.js';
import { BankApiStatementAdapter } from './adapters/bank-api-statement.adapter.js';
import { CsvJsonStatementAdapter } from './adapters/csv-json-statement.adapter.js';
import type { CreateBankStatementDto } from './dto/create-bank-statement.dto.js';
import type { QueryBankStatementsDto } from './dto/query-bank-statements.dto.js';
import { BankStatement } from './entities/bank-statement.entity.js';
import { BankTransaction } from './entities/bank-transaction.entity.js';
import type { StatementSourceAdapter } from './interfaces/statement-source-adapter.interface.js';
import { ReconciliationExceptionsService } from './reconciliation-exceptions.service.js';
import { ReconciliationService } from './reconciliation.service.js';

export interface BankStatementView {
  id: string;
  code: string;
  accountId: string;
  statementDate: string;
  openingBalance: string | null;
  closingBalance: string | null;
  status: BankStatementStatus;
  source: BankTransactionSource;
  sourceRef: string | null;
  lineCount: number;
  importedAt: string | null;
  lastMatchedAt: string | null;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportStatementResult {
  statement: BankStatementView;
  jobRunId: string | null;
}

/** Tiền tố tài khoản tiền được phép gắn sao kê. */
const CASH_ACCOUNT_PREFIXES = ['111', '112'];

/**
 * Nhập & quản lý **sao kê ngân hàng** (mục 10.B).
 *
 * Luồng: `create` ghi bảng sao kê + nội dung thô rồi **xếp job** `import-statement`
 * (không chặn request, vì file sao kê có thể dài). Job sẽ: chọn adapter → chuẩn hóa
 * → chống trùng → lưu `bank_transactions` → gọi khớp đối soát.
 *
 * Nhờ quyết định #4 (một mô hình giao dịch thống nhất), phần chọn adapter là
 * **điểm duy nhất** biết dữ liệu đến từ đâu; mọi bước sau chỉ làm việc với
 * `NormalizedBankTransaction`.
 */
@Injectable()
export class BankStatementsService {
  private readonly logger = new Logger(BankStatementsService.name);
  private readonly adapters: StatementSourceAdapter[];

  constructor(
    @InjectRepository(BankStatement)
    private readonly statements: Repository<BankStatement>,
    @InjectRepository(BankTransaction)
    private readonly transactions: Repository<BankTransaction>,
    private readonly accounts: AccountsService,
    private readonly queue: QueueService,
    private readonly reconciliation: ReconciliationService,
    private readonly exceptions: ReconciliationExceptionsService,
    csvJsonAdapter: CsvJsonStatementAdapter,
  ) {
    // Thứ tự quan trọng: adapter file đứng trước; adapter API là khung (supports = false).
    this.adapters = [csvJsonAdapter, new BankApiStatementAdapter()];
  }

  // ------------------------------------------------------------------ nhập

  async create(
    dto: CreateBankStatementDto,
    actor: AuthUser,
  ): Promise<ImportStatementResult> {
    const account = await this.accounts.getPostable(dto.accountId);
    if (!CASH_ACCOUNT_PREFIXES.some((prefix) => account.code.startsWith(prefix))) {
      throw new BadRequestException(
        `Tài khoản ${account.code} không phải tài khoản tiền (111/112) — sao kê ngân hàng chỉ áp dụng cho tài khoản tiền`,
      );
    }

    const code = dto.code.trim();
    const existing = await this.statements.findOne({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Mã sao kê "${code}" đã tồn tại`);
    }

    const statement = this.statements.create({
      code,
      accountId: dto.accountId,
      statementDate: dto.statementDate,
      openingBalance:
        dto.openingBalance !== undefined ? moneyToString(dto.openingBalance) : null,
      closingBalance:
        dto.closingBalance !== undefined ? moneyToString(dto.closingBalance) : null,
      status: BankStatementStatus.DRAFT,
      source: BankTransactionSource.FILE,
      sourceRef: dto.sourceRef?.trim() || null,
      rawContent: dto.content,
      lineCount: 0,
      importedBy: actor.id,
      importedAt: null,
      lastMatchedAt: null,
      reconciledBy: null,
      reconciledAt: null,
      createdBy: actor.id,
    });

    const saved = await this.statements.save(statement);

    let jobRun: JobRun | null = null;
    try {
      jobRun = await this.queue.enqueue({
        queue: JobQueue.STATEMENTS,
        jobName: JobName.IMPORT_STATEMENT,
        payload: { statementId: saved.id },
        trigger: JobTrigger.API,
        actor,
      });
    } catch (error) {
      this.logger.error(
        `Không xếp được job nhập sao kê ${saved.code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { statement: this.toView(saved), jobRunId: jobRun?.id ?? null };
  }

  /**
   * Chạy trong job `import-statement` (worker gọi).
   *
   * Idempotent theo từng dòng: chống trùng bằng
   * `UNIQUE(account_id, bank_ref, amount, transaction_date)` nên nạp lại cùng file
   * không nhân đôi số liệu.
   */
  async importStatement(statementId: string): Promise<{
    statementId: string;
    parsed: number;
    inserted: number;
    skippedDuplicates: number;
    adapter: string;
    match: Awaited<ReturnType<ReconciliationService['autoMatchStatement']>> | null;
  }> {
    const statement = await this.statements.findOne({ where: { id: statementId } });
    if (!statement) {
      throw new NotFoundException('Không tìm thấy bảng sao kê');
    }
    if (statement.status === BankStatementStatus.RECONCILED) {
      throw new BadRequestException('Sao kê đã chốt — không nhập lại được');
    }
    if (!statement.rawContent) {
      throw new BadRequestException('Bảng sao kê không có nội dung để nhập');
    }

    const adapter = this.pickAdapter(statement.rawContent);
    const parsed = adapter.parse({
      content: statement.rawContent,
      currency: 'VND',
      sourceRef: statement.sourceRef,
    });

    let inserted = 0;
    let skipped = 0;

    for (const line of parsed) {
      const duplicate = await this.findDuplicate(statement.accountId, line);
      if (duplicate) {
        skipped += 1;
        continue;
      }

      await this.transactions.save(
        this.transactions.create({
          statementId: statement.id,
          accountId: statement.accountId,
          transactionDate: line.transactionDate,
          valueDate: line.valueDate,
          description: line.description,
          reference: line.reference,
          bankRef: line.bankRef,
          direction: line.direction,
          amount: line.amount,
          currency: line.currency,
          source: adapter.source,
          sourceRef: statement.sourceRef,
          raw: line.raw,
          matchStatus: BankMatchStatus.UNMATCHED,
        }),
      );
      inserted += 1;
    }

    statement.lineCount = await this.transactions.count({
      where: { statementId: statement.id },
    });
    statement.importedAt = new Date();
    await this.statements.save(statement);

    // Cùng pipeline: chuẩn hóa xong ⇒ khớp ngay (không có nhánh riêng cho file).
    const match = await this.reconciliation.autoMatchStatement(statement.id);

    this.logger.log(
      `Nhập sao kê ${statement.code} bằng adapter "${adapter.name}": ${parsed.length} dòng đọc được, ` +
        `${inserted} dòng mới, ${skipped} dòng trùng bị bỏ qua`,
    );

    return {
      statementId: statement.id,
      parsed: parsed.length,
      inserted,
      skippedDuplicates: skipped,
      adapter: adapter.name,
      match,
    };
  }

  // ---------------------------------------------------------------- truy vấn

  async list(query: QueryBankStatementsDto = {}): Promise<BankStatementView[]> {
    const qb = this.statements
      .createQueryBuilder('statement')
      .orderBy('statement.statementDate', 'DESC')
      .addOrderBy('statement.code', 'DESC')
      .take(query.limit ?? 50)
      .skip(query.offset ?? 0);

    if (query.status) {
      qb.andWhere('statement.status = :status', { status: query.status });
    }
    if (query.accountId) {
      qb.andWhere('statement.accountId = :accountId', { accountId: query.accountId });
    }
    if (query.search) {
      qb.andWhere('statement.code ILIKE :s', { s: `%${query.search}%` });
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.toView(row));
  }

  async findById(id: string): Promise<BankStatementView> {
    return this.toView(await this.requireStatement(id));
  }

  async lines(id: string): Promise<BankTransaction[]> {
    await this.requireStatement(id);
    return this.transactions.find({
      where: { statementId: id },
      order: { transactionDate: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Chốt đối soát một bảng sao kê.
   *
   * Chỉ cho chốt khi **không còn dòng `unmatched`** — còn dòng chưa khớp mà vẫn
   * chốt thì con số "đã đối soát" trở thành lời nói suông. Phần còn lại phải được
   * xử lý tường minh (khớp tay hoặc bỏ qua có lý do) trước.
   */
  async reconcile(id: string, actor: AuthUser): Promise<BankStatementView> {
    const statement = await this.requireStatement(id);
    if (statement.status === BankStatementStatus.RECONCILED) {
      return this.toView(statement);
    }

    const unmatched = await this.transactions.count({
      where: { statementId: id, matchStatus: BankMatchStatus.UNMATCHED },
    });
    if (unmatched > 0) {
      throw new BadRequestException(
        `Còn ${unmatched} dòng sao kê chưa khớp — hãy khớp hoặc xử lý lệch trước khi chốt`,
      );
    }

    const openExceptions = (
      await this.exceptions.list({ statementId: id, limit: 200 })
    ).filter((exception) => exception.status === ReconciliationExceptionStatus.OPEN).length;
    if (openExceptions > 0) {
      this.logger.warn(
        `Chốt sao kê ${statement.code} nhưng vẫn còn ${openExceptions} dòng lệch chưa xử lý`,
      );
    }

    statement.status = BankStatementStatus.RECONCILED;
    statement.reconciledBy = actor.id;
    statement.reconciledAt = new Date();
    return this.toView(await this.statements.save(statement));
  }

  async remove(id: string): Promise<void> {
    const statement = await this.requireStatement(id);
    if (statement.status === BankStatementStatus.RECONCILED) {
      throw new BadRequestException('Sao kê đã chốt — không xoá được');
    }
    await this.transactions.delete({ statementId: id });
    await this.statements.remove(statement);
  }

  // ----------------------------------------------------------------- helpers

  private async requireStatement(id: string): Promise<BankStatement> {
    const statement = await this.statements.findOne({ where: { id } });
    if (!statement) {
      throw new NotFoundException('Không tìm thấy bảng sao kê');
    }
    return statement;
  }

  private pickAdapter(content: string): StatementSourceAdapter {
    const adapter = this.adapters.find((candidate) => candidate.supports(content));
    if (!adapter) {
      throw new BadRequestException(
        'Không có adapter nào đọc được nội dung sao kê (hỗ trợ CSV và JSON)',
      );
    }
    return adapter;
  }

  private findDuplicate(
    accountId: string,
    line: {
      bankRef: string | null;
      amount: string;
      transactionDate: string;
    },
  ): Promise<BankTransaction | null> {
    if (!line.bankRef) {
      // Không có mã giao dịch thì **không** kết luận hai dòng là một — không đoán.
      return Promise.resolve(null);
    }
    return this.transactions.findOne({
      where: {
        accountId,
        bankRef: line.bankRef,
        amount: line.amount,
        transactionDate: line.transactionDate,
      },
    });
  }

  private toView(statement: BankStatement): BankStatementView {
    return {
      id: statement.id,
      code: statement.code,
      accountId: statement.accountId,
      statementDate: statement.statementDate,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      status: statement.status,
      source: statement.source,
      sourceRef: statement.sourceRef,
      lineCount: statement.lineCount,
      importedAt: statement.importedAt?.toISOString() ?? null,
      lastMatchedAt: statement.lastMatchedAt?.toISOString() ?? null,
      reconciledAt: statement.reconciledAt?.toISOString() ?? null,
      createdAt: statement.createdAt.toISOString(),
      updatedAt: statement.updatedAt.toISOString(),
    };
  }
}
