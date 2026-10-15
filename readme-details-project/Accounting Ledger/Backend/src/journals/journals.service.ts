import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  Repository,
} from 'typeorm';

import { AccountsService } from '../accounts/accounts.service.js';
import {
  isImmutable,
  JournalStatus,
} from '../common/enums/journal-status.enum.js';
import {
  requiresSourceId,
  SourceType,
} from '../common/enums/source-type.enum.js';
import {
  isPartyAccount,
  partyAccountMessage,
} from '../common/utils/party-account.util.js';
import {
  exceedsMoneyRange,
  moneyToString,
  sumMoney,
  toMoney,
} from '../common/utils/money.util.js';
import type { FiscalPeriod } from '../fiscal-periods/entities/fiscal-period.entity.js';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { LedgerMovement } from '../ledger/interfaces/account-balance-view.interface.js';
import { PartiesService } from '../parties/parties.service.js';
import type { CreateJournalEntryDto } from './dto/create-journal-entry.dto.js';
import type { CreateJournalLineDto } from './dto/create-journal-line.dto.js';
import type { QueryJournalsDto } from './dto/query-journals.dto.js';
import type { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto.js';
import type { UpdateJournalEntryDto } from './dto/update-journal-entry.dto.js';
import { JournalEntry } from './entities/journal-entry.entity.js';
import { JournalLine } from './entities/journal-line.entity.js';

/** Dòng đã chuẩn hóa (đã kiểm tra hợp lệ, chưa ghi DB). */
interface NormalizedLine {
  lineNo: number;
  accountId: string;
  debit: string;
  credit: string;
  description: string | null;
  /** Đối tượng của sổ cái phụ (mục 10.0) — chỉ có ở dòng tài khoản công nợ. */
  partyId: string | null;
}

interface NormalizedEntry {
  lines: NormalizedLine[];
  totalDebit: string;
  totalCredit: string;
}

/**
 * Bút toán (mục 5).
 *
 * Vòng đời: `draft → approved → posted → reversed`, thực thi bằng RBAC:
 * `maker` lập, `checker` xác nhận, `poster` ghi sổ.
 *
 * Các bất biến được bảo vệ ở đây:
 * 1. Σ Nợ = Σ Có, tổng > 0, tối thiểu 2 dòng — kiểm tra ở backend.
 * 2. Chỉ ghi sổ vào tài khoản lá đang hoạt động.
 * 3. Chỉ ghi sổ khi kỳ kế toán đang mở.
 * 4. Bút toán đã ghi sổ là bất biến — sai thì tạo bút toán đảo.
 * 5. Ghi sổ nằm trong một transaction, có khóa chống ghi trùng và chống
 *    mất cập nhật số dư.
 */
@Injectable()
export class JournalsService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
    private readonly accounts: AccountsService,
    private readonly periods: FiscalPeriodsService,
    private readonly ledger: LedgerService,
    private readonly parties: PartiesService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------- truy vấn

  async list(query: QueryJournalsDto = {}): Promise<JournalEntry[]> {
    const qb = this.entries
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.period', 'period')
      .leftJoinAndSelect('entry.lines', 'line')
      .leftJoinAndSelect('line.account', 'account')
      .orderBy('entry.date', 'DESC')
      .addOrderBy('entry.createdAt', 'DESC')
      .take(query.limit ?? 100)
      .skip(query.offset ?? 0);

    if (query.status) {
      qb.andWhere('entry.status = :status', { status: query.status });
    }
    if (query.periodId) {
      qb.andWhere('entry.periodId = :periodId', { periodId: query.periodId });
    }
    if (query.fromDate) {
      qb.andWhere('entry.date >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('entry.date <= :toDate', { toDate: query.toDate });
    }
    if (query.search) {
      qb.andWhere(
        '(entry.entryNo ILIKE :s OR entry.description ILIKE :s OR entry.reference ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.accountId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.entry_id = entry.id AND jl.account_id = :accountId)',
        { accountId: query.accountId },
      );
    }

    const rows = await qb.getMany();
    for (const row of rows) {
      row.lines?.sort((a, b) => a.lineNo - b.lineNo);
    }
    return rows;
  }

  async findById(id: string): Promise<JournalEntry> {
    const entry = await this.entries.findOne({
      where: { id },
      relations: { lines: { account: true }, period: true },
    });
    if (!entry) {
      throw new NotFoundException('Không tìm thấy bút toán');
    }
    entry.lines.sort((a, b) => a.lineNo - b.lineNo);
    return entry;
  }

  // ------------------------------------------------------------ lập nháp

  /**
   * Tạo bút toán nháp.
   *
   * Nếu `idempotencyKey` đã tồn tại, trả về bút toán cũ thay vì tạo bản sao —
   * nhờ vậy client retry do timeout mạng không sinh bút toán trùng.
   */
  async create(
    dto: CreateJournalEntryDto,
    actorId: string,
  ): Promise<JournalEntry> {
    return this.dataSource.transaction((manager) =>
      this.createWithin(manager, dto, actorId),
    );
  }

  /**
   * **Bên trong một transaction** — tạo bút toán nháp.
   *
   * Tách ra để `create` (bút toán nhập tay) và `postDocument` (chứng từ 10.A ghi sổ
   * kèm cập nhật chứng từ) dùng chung **đúng một** luật, và để phần ghi của chứng từ
   * xảy ra trong cùng transaction với bút toán.
   */
  private async createWithin(
    manager: EntityManager,
    dto: CreateJournalEntryDto,
    actorId: string,
  ): Promise<JournalEntry> {
    const idempotencyKey = dto.idempotencyKey?.trim() || null;

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const period = await this.periods.resolveByDate(dto.date);
    // Bất biến số 3: kỳ đã khóa/chốt thì không nhận bút toán nào, kể cả bản nháp.
    this.periods.assertAcceptsPostings(period);

    // Mục 10.0: chứng từ nguồn phải được khai báo rõ và chỉ sinh MỘT bút toán gốc.
    const sourceType = dto.sourceType ?? SourceType.MANUAL;
    const sourceId = dto.sourceId?.trim() || null;
    this.assertSourcePair(sourceType, sourceId);
    if (sourceId) {
      await this.assertSourceUnused(manager, sourceType, sourceId);
    }

    const normalized = await this.normalizeLines(dto.lines);

    const entry = manager.create(JournalEntry, {
      entryNo: null,
      date: dto.date,
      periodId: period.id,
      description: dto.description.trim(),
      reference: dto.reference?.trim() || null,
      sourceType,
      sourceId,
      status: JournalStatus.DRAFT,
      totalDebit: normalized.totalDebit,
      totalCredit: normalized.totalCredit,
      idempotencyKey,
      createdBy: actorId,
      lines: normalized.lines.map((line) =>
        manager.create(JournalLine, {
          lineNo: line.lineNo,
          accountId: line.accountId,
          partyId: line.partyId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        }),
      ),
    });

    try {
      return await manager.save(JournalEntry, entry);
    } catch (error) {
      // Hai request đồng thời cùng khóa: bản ghi thắng đã tồn tại ⇒ trả về nó.
      if (idempotencyKey) {
        const existing = await this.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          return existing;
        }
      }
      // Hai request đồng thời cùng chứng từ nguồn: unique index chặn bản thứ hai.
      if (sourceId) {
        const existing = await manager.findOne(JournalEntry, {
          where: { sourceType, sourceId },
        });
        if (existing) {
          throw new ConflictException(
            `Chứng từ nguồn (${sourceType}, ${sourceId}) đã được ghi nhận ở bút toán ` +
              `${existing.entryNo ?? '(còn nháp)'} — không thể tạo bút toán thứ hai`,
          );
        }
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateJournalEntryDto): Promise<JournalEntry> {
    const entry = await this.findEntity(id);
    this.assertDraft(entry, 'sửa');
    // Không cho sửa bút toán nháp nằm trong kỳ đã khóa/chốt.
    this.periods.assertAcceptsPostings(await this.periods.findById(entry.periodId));

    if (dto.date !== undefined && dto.date !== entry.date) {
      const period = await this.periods.resolveByDate(dto.date);
      this.periods.assertAcceptsPostings(period);
      entry.date = dto.date;
      entry.periodId = period.id;
    }
    if (dto.description !== undefined) {
      entry.description = dto.description.trim();
    }
    if (dto.reference !== undefined) {
      entry.reference = dto.reference?.trim() || null;
    }

    if (dto.lines) {
      const normalized = await this.normalizeLines(dto.lines);
      entry.totalDebit = normalized.totalDebit;
      entry.totalCredit = normalized.totalCredit;

      // Thay toàn bộ dòng cũ bằng danh sách mới.
      await this.lines.delete({ entryId: entry.id });
      entry.lines = normalized.lines.map((line) =>
        this.lines.create({
          entryId: entry.id,
          lineNo: line.lineNo,
          accountId: line.accountId,
          partyId: line.partyId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        }),
      );
    }

    return this.entries.save(entry);
  }

  async remove(id: string): Promise<void> {
    const entry = await this.findEntity(id);
    this.assertDraft(entry, 'xóa');
    // Không cho xóa bút toán nháp nằm trong kỳ đã khóa/chốt.
    this.periods.assertAcceptsPostings(await this.periods.findById(entry.periodId));
    await this.entries.remove(entry);
  }

  // -------------------------------------------------------------- duyệt

  /** `checker` xác nhận bút toán nháp → sẵn sàng ghi sổ. */
  async approve(id: string, actorId: string): Promise<JournalEntry> {
    const entry = await this.findEntity(id, true);

    if (entry.status !== JournalStatus.DRAFT) {
      throw new BadRequestException(
        `Chỉ xác nhận được bút toán nháp (bút toán đang ở trạng thái "${entry.status}")`,
      );
    }

    // Xác thực lại trên dữ liệu đã lưu: tài khoản có thể đã đổi trạng thái
    // sau khi bút toán được lập.
    this.assertBalanced(entry.lines);
    await this.assertLinesPostable(entry.lines);

    entry.status = JournalStatus.APPROVED;
    entry.approvedBy = actorId;
    entry.approvedAt = new Date();

    return this.entries.save(entry);
  }

  // ------------------------------------------------------------- ghi sổ

  /**
   * Ghi sổ bút toán đã xác nhận.
   *
   * Toàn bộ nằm trong **một transaction**:
   * 1. Khóa dòng bút toán (chống ghi sổ hai lần do chạy song song).
   * 2. Khóa kỳ kế toán và kiểm tra kỳ đang mở.
   * 3. Cân bằng lại Nợ/Có trên dữ liệu đã lưu.
   * 4. Cấp số hiệu chứng từ (khóa theo kỳ, không trùng).
   * 5. Cập nhật số dư từng tài khoản (khóa bi quan từng dòng số dư).
   */
  async post(id: string, actorId: string): Promise<JournalEntry> {
    return this.dataSource.transaction((manager) =>
      this.postWithin(manager, id, actorId),
    );
  }

  /**
   * **Bên trong một transaction** — ghi sổ bút toán đã xác nhận.
   *
   * Năm bước (khóa bút toán → khóa kỳ → cân bằng lại → cấp số hiệu → cập nhật số dư)
   * đều trên `manager` được truyền vào, nên có thể ghép với việc cập nhật chứng từ nguồn.
   */
  private async postWithin(
    manager: EntityManager,
    id: string,
    actorId: string,
  ): Promise<JournalEntry> {
      const entry = await this.lockEntryWithLines(manager, id);

      // Ghi sổ là thao tác idempotent: gọi lại không sinh phát sinh thêm.
      if (entry.status === JournalStatus.POSTED) {
        return entry;
      }
      if (entry.status === JournalStatus.REVERSED) {
        throw new BadRequestException(
          'Bút toán đã bị đảo — không thể ghi sổ',
        );
      }
      if (entry.status !== JournalStatus.APPROVED) {
        throw new BadRequestException(
          'Chỉ ghi sổ bút toán đã được xác nhận',
        );
      }

      const period = await this.periods.resolveByDate(entry.date, manager, true);
      this.periods.assertAcceptsPostings(period);

      this.assertBalanced(entry.lines);
      await this.assertLinesPostable(entry.lines);

      entry.entryNo = await this.nextEntryNo(manager, period);
      entry.status = JournalStatus.POSTED;
      entry.postedBy = actorId;
      entry.postedAt = new Date();
      await manager.save(JournalEntry, entry);

      await this.ledger.applyMovements(
        manager,
        entry.periodId,
        this.toMovements(entry.lines),
      );

      return entry;
  }

  /**
   * Tạo **và** ghi sổ bút toán cho chứng từ nguồn, cộng việc cập nhật chính chứng từ đó
   * (`commit`) — **cùng một transaction** (mục 10.A, quyết định #1).
   *
   * Vì sao phải gộp: nếu để chứng từ (hóa đơn/phiếu thu) ghi trạng thái ở một transaction
   * riêng thì sự cố giữa hai bước để lại "bút toán đã ghi sổ nhưng hóa đơn còn approved" —
   * chạy lại bị `UNIQUE(source_type, source_id)` chặn và hóa đơn kẹt vĩnh viễn. Gộp lại thì
   * hoặc tất cả thành công, hoặc không có gì — kể cả bút toán.
   *
   * `commit` chạy **trong** transaction nên chỉ được phép dùng `manager` (không mở transaction
   * lồng); webhook nên phát **sau khi** hàm này trả về (đã commit). Không có gì được tạo ra ngoài
   * transaction này ⇒ mọi trường hợp lỗi đều rollback về trạng thái chứng từ còn nháp/xác nhận.
   */
  async postDocument(
    dto: CreateJournalEntryDto,
    actorId: string,
    commit: (manager: EntityManager, entry: JournalEntry) => Promise<void>,
  ): Promise<JournalEntry> {
    return this.dataSource.transaction(async (manager) => {
      const entry = await this.createWithin(manager, dto, actorId);
      const posted = await this.postWithin(manager, entry.id, actorId);
      await commit(manager, posted);
      return posted;
    });
  }

  /**
   * Đảo bút toán đã ghi sổ **và** cập nhật chứng từ nguồn trong cùng transaction —
   * bản dựng của `reverseDocument` cho hóa đơn/phiếu (mục 10.A).
   *
   * Cùng lý do với `postDocument`: đảo xong mà chứng từ chưa chuyển `voided` thì chạy lại
   * sẽ gặp bút toán gốc đã `reversed` và không thoát ra được.
   */
  async reverseDocument(
    id: string,
    dto: ReverseJournalEntryDto,
    actorId: string,
    commit: (manager: EntityManager, reversal: JournalEntry) => Promise<void>,
  ): Promise<JournalEntry> {
    return this.dataSource.transaction(async (manager) => {
      const reversal = await this.reverseWithin(manager, id, dto, actorId);
      await commit(manager, reversal);
      return reversal;
    });
  }

  // --------------------------------------------------------------- đảo

  /**
   * Đảo bút toán đã ghi sổ bằng **bút toán điều chỉnh**.
   *
   * Không sửa/xóa bút toán gốc (bất biến số 2). Bút toán đảo có Nợ/Có hoán đổi
   * và được ghi sổ ngay trong cùng transaction; bản gốc chuyển sang `reversed`.
   */
  async reverse(
    id: string,
    dto: ReverseJournalEntryDto,
    actorId: string,
  ): Promise<JournalEntry> {
    return this.dataSource.transaction((manager) =>
      this.reverseWithin(manager, id, dto, actorId),
    );
  }

  /**
   * **Bên trong một transaction** — đảo bút toán đã ghi sổ.
   *
   * Dùng được cho cả `reverse` (bút toán nhập tay) lẫn `reverseDocument` (hóa đơn/phiếu
   * cập nhật trạng thái trong cùng transaction).
   */
  private async reverseWithin(
    manager: EntityManager,
    id: string,
    dto: ReverseJournalEntryDto,
    actorId: string,
  ): Promise<JournalEntry> {
      const original = await this.lockEntryWithLines(manager, id);

      if (original.status !== JournalStatus.POSTED) {
        throw new BadRequestException(
          'Chỉ đảo được bút toán đã ghi sổ',
        );
      }

      const date = dto.date ?? original.date;
      const period = await this.periods.resolveByDate(date, manager, true);
      this.periods.assertAcceptsPostings(period);

      const reason = dto.reason.trim();
      const reversal = manager.create(JournalEntry, {
        entryNo: null,
        date,
        periodId: period.id,
        description: original.entryNo
          ? `Đảo bút toán ${original.entryNo} — ${reason}`
          : `Đảo bút toán — ${reason}`,
        reference: original.reference,
        // Bút toán đảo là **chứng từ điều chỉnh**, không phải chứng từ nguồn mới: nếu
        // sao chép `sourceId` sẽ vi phạm ràng buộc "một nguồn = một bút toán" và phá
        // truy vết. Quan hệ với bản gốc đã có `reversalOfEntryId`.
        sourceType: SourceType.MANUAL,
        sourceId: null,
        status: JournalStatus.DRAFT,
        totalDebit: moneyToString(original.totalDebit),
        totalCredit: moneyToString(original.totalCredit),
        idempotencyKey: null,
        createdBy: actorId,
        reversalOfEntryId: original.id,
        lines: original.lines.map((line, index) =>
          manager.create(JournalLine, {
            lineNo: index + 1,
            accountId: line.accountId,
            partyId: line.partyId,
            // Hoán đổi Nợ ↔ Có.
            debit: moneyToString(line.credit),
            credit: moneyToString(line.debit),
            description: line.description,
          }),
        ),
      });

      const savedReversal = await manager.save(JournalEntry, reversal);

      savedReversal.entryNo = await this.nextEntryNo(manager, period);
      savedReversal.status = JournalStatus.POSTED;
      savedReversal.postedBy = actorId;
      savedReversal.postedAt = new Date();
      await manager.save(JournalEntry, savedReversal);

      const reversalLines = await manager.find(JournalLine, {
        where: { entryId: savedReversal.id },
        order: { lineNo: 'ASC' },
      });
      savedReversal.lines = reversalLines;

      // Dòng của bút toán đảo đã hoán đổi sẵn nên cộng bình thường là đủ để triệt tiêu.
      await this.ledger.applyMovements(
        manager,
        period.id,
        this.toMovements(reversalLines),
      );

      original.status = JournalStatus.REVERSED;
      original.reversedByEntryId = savedReversal.id;
      await manager.save(JournalEntry, original);

      return savedReversal;
  }

  // -------------------------------------------------------------- helpers

  private async findEntity(
    id: string,
    withLines = false,
  ): Promise<JournalEntry> {
    const entry = await this.entries.findOne({
      where: { id },
      ...(withLines ? { relations: { lines: true } } : {}),
    });
    if (!entry) {
      throw new NotFoundException('Không tìm thấy bút toán');
    }
    if (entry.lines) {
      entry.lines.sort((a, b) => a.lineNo - b.lineNo);
    }
    return entry;
  }

  private async findByIdempotencyKey(
    key: string,
  ): Promise<JournalEntry | null> {
    return this.entries.findOne({
      where: { idempotencyKey: key },
      relations: { lines: true },
    });
  }

  /**
   * Mục 10.0: `sourceType` khác `manual` ⇒ **bắt buộc** có `sourceId`; ngược lại
   * `manual` không được kèm `sourceId` (tránh hai nguồn cùng trỏ một chứng từ).
   */
  private assertSourcePair(
    sourceType: SourceType,
    sourceId: string | null,
  ): void {
    if (requiresSourceId(sourceType) && !sourceId) {
      throw new BadRequestException(
        `sourceType "${sourceType}" phải đi kèm sourceId (chứng từ nguồn)`,
      );
    }
    if (!requiresSourceId(sourceType) && sourceId) {
      throw new BadRequestException(
        'sourceId chỉ dùng khi sourceType khác "manual"',
      );
    }
  }

  /**
   * Một chứng từ nguồn chỉ sinh **một** bút toán gốc (mục 10.0).
   *
   * Kiểm tra trước để trả lỗi rõ ràng; unique index `journal_entries_source_uidx`
   * ở DB vẫn là lá chắn cuối cho trường hợp hai request chạy song song.
   */
  private async assertSourceUnused(
    manager: EntityManager,
    sourceType: SourceType,
    sourceId: string,
  ): Promise<void> {
    const existing = await manager.findOne(JournalEntry, {
      where: { sourceType, sourceId },
    });
    if (existing) {
      throw new ConflictException(
        `Chứng từ nguồn (${sourceType}, ${sourceId}) đã được ghi nhận ở bút toán ` +
          `${existing.entryNo ?? '(còn nháp)'} — không thể tạo bút toán thứ hai`,
      );
    }
  }

  private assertDraft(entry: JournalEntry, action: string): void {
    if (entry.status !== JournalStatus.DRAFT) {
      throw new BadRequestException(
        isImmutable(entry.status)
          ? `Bút toán đã ghi sổ là bất biến — không thể ${action}. Hãy tạo bút toán đảo nếu cần điều chỉnh.`
          : `Chỉ ${action} được bút toán nháp (bút toán đang ở trạng thái "${entry.status}")`,
      );
    }
  }

  /**
   * Khóa dòng bút toán rồi nạp dòng định khoản.
   *
   * Không dùng `relations` chung với `lock`: Postgres không cho `FOR UPDATE`
   * trên phía nullable của outer join (quan hệ 1-n).
   */
  private async lockEntryWithLines(
    manager: EntityManager,
    id: string,
  ): Promise<JournalEntry> {
    const entry = await manager.findOne(JournalEntry, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entry) {
      throw new NotFoundException('Không tìm thấy bút toán');
    }

    entry.lines = await manager.find(JournalLine, {
      where: { entryId: entry.id },
      order: { lineNo: 'ASC' },
    });

    return entry;
  }

  /**
   * Chuẩn hóa và kiểm tra các dòng định khoản:
   * mỗi dòng chỉ một bên Nợ/Có và phải > 0; chỉ dùng tài khoản lá đang hoạt động;
   * cuối cùng bắt buộc Σ Nợ = Σ Có > 0.
   */
  private async normalizeLines(
    dtos: readonly CreateJournalLineDto[],
  ): Promise<NormalizedEntry> {
    if (dtos.length < 2) {
      throw new BadRequestException(
        'Bút toán phải có tối thiểu 2 dòng định khoản',
      );
    }

    const lines: NormalizedLine[] = [];

    for (const [index, dto] of dtos.entries()) {
      const position = index + 1;
      const debit = toMoney(dto.debit ?? 0);
      const credit = toMoney(dto.credit ?? 0);

      if (debit.isNegative() || credit.isNegative()) {
        throw new BadRequestException(
          `Dòng ${position}: số tiền không được âm`,
        );
      }
      if (exceedsMoneyRange(debit) || exceedsMoneyRange(credit)) {
        throw new BadRequestException(
          `Dòng ${position}: số tiền vượt quá giới hạn NUMERIC(19,4)`,
        );
      }

      const hasDebit = debit.greaterThan(0);
      const hasCredit = credit.greaterThan(0);
      if (hasDebit === hasCredit) {
        throw new BadRequestException(
          `Dòng ${position}: mỗi dòng chỉ được ghi Nợ hoặc Có, và số tiền phải lớn hơn 0`,
        );
      }

      // Chỉ tài khoản lá đang hoạt động mới được ghi sổ.
      const account = await this.accounts.getPostable(dto.accountId);

      // Mục 10.0 — sổ cái phụ: đối tượng chỉ gắn được vào dòng tài khoản công nợ.
      let partyId: string | null = null;
      if (dto.partyId) {
        if (!isPartyAccount(account.code)) {
          throw new BadRequestException(
            `Dòng ${position}: ${partyAccountMessage(account.code)}`,
          );
        }
        partyId = (await this.parties.resolveActive(dto.partyId)).id;
      }

      lines.push({
        lineNo: position,
        accountId: account.id,
        partyId,
        debit: moneyToString(debit),
        credit: moneyToString(credit),
        description: dto.description?.trim() || null,
      });
    }

    const totalDebit = moneyToString(sumMoney(lines.map((l) => l.debit)));
    const totalCredit = moneyToString(sumMoney(lines.map((l) => l.credit)));

    this.assertBalanced(lines);

    return { lines, totalDebit, totalCredit };
  }

  /** Bất biến số 1: Σ Nợ = Σ Có, tổng > 0. */
  private assertBalanced(
    lines: readonly { debit: string; credit: string }[],
  ): void {
    if (lines.length < 2) {
      throw new BadRequestException(
        'Bút toán phải có tối thiểu 2 dòng định khoản',
      );
    }

    const totalDebit = sumMoney(lines.map((line) => line.debit));
    const totalCredit = sumMoney(lines.map((line) => line.credit));

    if (!totalDebit.greaterThan(0)) {
      throw new BadRequestException('Tổng phát sinh Nợ phải lớn hơn 0');
    }
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Bút toán không cân bằng: tổng Nợ ${moneyToString(totalDebit)} ≠ tổng Có ${moneyToString(totalCredit)}`,
      );
    }
  }

  private async assertLinesPostable(
    lines: readonly JournalLine[],
  ): Promise<void> {
    for (const line of lines) {
      await this.accounts.getPostable(line.accountId);
    }
  }

  private toMovements(lines: readonly JournalLine[]): LedgerMovement[] {
    return lines.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
    }));
  }

  /**
   * Cấp số hiệu chứng từ kế tiếp của kỳ: `JE-<mã kỳ>-<số thứ tự 4 chữ số>`.
   *
   * Dùng `pg_advisory_xact_lock` theo mã kỳ để hai lần ghi sổ đồng thời không
   * cấp trùng số hiệu; khóa tự nhả khi transaction kết thúc.
   */
  private async nextEntryNo(
    manager: EntityManager,
    period: FiscalPeriod,
  ): Promise<string> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
      `journal-entry-no:${period.code}`,
    ]);

    const rows = await manager.query<{ count: number | string }[]>(
      'SELECT COUNT(*) AS count FROM journal_entries WHERE period_id = $1 AND entry_no IS NOT NULL',
      [period.id],
    );

    const sequence = Number(rows[0]?.count ?? 0) + 1;
    return `JE-${period.code}-${String(sequence).padStart(4, '0')}`;
  }
}
