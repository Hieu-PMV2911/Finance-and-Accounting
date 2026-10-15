import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, Repository } from 'typeorm';

import type { PartyType } from '../common/enums/party-type.enum.js';
import { moneyToString, toMoney } from '../common/utils/money.util.js';
import { LEDGER_STATUSES } from '../ledger/ledger-aggregate.util.js';
import type { CreatePartyDto } from './dto/create-party.dto.js';
import type { QueryPartiesDto } from './dto/query-parties.dto.js';
import type { UpdatePartyDto } from './dto/update-party.dto.js';
import { Party } from './entities/party.entity.js';

/** Số dư công nợ của đối tượng theo **một tài khoản** (131*, 331*…). */
export interface PartyAccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  /** Số dư thuần: dương = dư Nợ, âm = dư Có (bất biến số 9). */
  netDebit: string;
}

/** Tổng hợp công nợ một đối tượng — phục vụ trang "Công nợ" và kiểm tra chéo số dư. */
export interface PartySummaryView {
  partyId: string;
  partyCode: string;
  partyName: string;
  partyType: PartyType;
  isActive: boolean;
  journalLines: number;
  accounts: PartyAccountBalance[];
  totals: { debit: string; credit: string; netDebit: string };
}

/**
 * Đối tượng của sổ cái phụ (mục 10.0) — khách hàng / nhà cung cấp.
 *
 * Bất biến được bảo vệ ở đây:
 * 1. `code` duy nhất trên toàn hệ thống.
 * 2. **Không xóa** đối tượng đã phát sinh bút toán — dữ liệu đã ghi sổ là append-only,
 *    xóa đối tượng sẽ làm mất chiều phân tích của các bút toán cũ. Chỉ được
 *    `isActive = false` (ngừng sử dụng).
 * 3. Chỉ đối tượng **đang hoạt động** mới được gắn vào bút toán mới.
 */
@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(Party)
    private readonly parties: Repository<Party>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Danh sách đối tượng, lọc theo loại / trạng thái / từ khóa. */
  async list(query: QueryPartiesDto = {}): Promise<Party[]> {
    const qb = this.parties.createQueryBuilder('party').orderBy('party.code', 'ASC');

    if (query.type) {
      qb.andWhere('party.type = :type', { type: query.type });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('party.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere(
        '(party.code ILIKE :s OR party.name ILIKE :s OR party.taxCode ILIKE :s OR party.contactEmail ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findById(id: string): Promise<Party> {
    const party = await this.parties.findOne({ where: { id } });
    if (!party) {
      throw new NotFoundException('Không tìm thấy đối tượng');
    }
    return party;
  }

  /**
   * Lấy đối tượng để **gắn vào bút toán mới** — chặn nếu đã ngừng sử dụng.
   * Dùng bởi `JournalsService` khi dòng định khoản có `partyId`.
   */
  async resolveActive(id: string): Promise<Party> {
    const party = await this.findById(id);
    if (!party.isActive) {
      throw new BadRequestException(
        `Đối tượng ${party.code} đã ngừng sử dụng — không gắn được vào bút toán mới`,
      );
    }
    return party;
  }

  async create(dto: CreatePartyDto): Promise<Party> {
    const code = dto.code.trim();
    await this.assertCodeAvailable(code);

    const party = this.parties.create({
      code,
      type: dto.type,
      name: dto.name.trim(),
      taxCode: dto.taxCode?.trim() || null,
      address: dto.address?.trim() || null,
      contactName: dto.contactName?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
      contactEmail: dto.contactEmail?.trim() || null,
      paymentTermDays: dto.paymentTermDays ?? 30,
      creditLimit: dto.creditLimit ? moneyToString(dto.creditLimit) : null,
      isActive: dto.isActive ?? true,
      description: dto.description?.trim() || null,
    });

    return this.parties.save(party);
  }

  async update(id: string, dto: UpdatePartyDto): Promise<Party> {
    const party = await this.findById(id);

    if (dto.code !== undefined && dto.code.trim() !== party.code) {
      const code = dto.code.trim();
      await this.assertCodeAvailable(code, id);
      party.code = code;
    }
    if (dto.type !== undefined) {
      party.type = dto.type;
    }
    if (dto.name !== undefined) {
      party.name = dto.name.trim();
    }
    if (dto.taxCode !== undefined) {
      party.taxCode = dto.taxCode?.trim() || null;
    }
    if (dto.address !== undefined) {
      party.address = dto.address?.trim() || null;
    }
    if (dto.contactName !== undefined) {
      party.contactName = dto.contactName?.trim() || null;
    }
    if (dto.contactPhone !== undefined) {
      party.contactPhone = dto.contactPhone?.trim() || null;
    }
    if (dto.contactEmail !== undefined) {
      party.contactEmail = dto.contactEmail?.trim() || null;
    }
    if (dto.paymentTermDays !== undefined) {
      party.paymentTermDays = dto.paymentTermDays;
    }
    if (dto.creditLimit !== undefined) {
      party.creditLimit = dto.creditLimit ? moneyToString(dto.creditLimit) : null;
    }
    if (dto.isActive !== undefined) {
      party.isActive = dto.isActive;
    }
    if (dto.description !== undefined) {
      party.description = dto.description?.trim() || null;
    }

    return this.parties.save(party);
  }

  /**
   * Xóa đối tượng — **chỉ khi chưa phát sinh bút toán**. Đã phát sinh thì dùng
   * `isActive = false`: bút toán cũ phải giữ nguyên đối tượng để báo cáo công nợ
   * theo đối tượng còn tái lập được.
   */
  async remove(id: string): Promise<void> {
    const party = await this.findById(id);

    const used = await this.usageCount(id);
    if (used > 0) {
      throw new ConflictException(
        `Đối tượng ${party.code} đã phát sinh ${used} dòng định khoản — ` +
          'không thể xóa. Hãy chuyển sang trạng thái ngừng sử dụng.',
      );
    }

    await this.parties.remove(party);
  }

  /**
   * Tổng hợp công nợ của một đối tượng (mục 10.A).
   *
   * Đọc **trực tiếp từ `journal_lines`** của bút toán POSTED/REVERSED — không có bảng
   * tổng hợp nào để lệch. Bút toán gốc đã `reversed` và bút toán đảo cùng được tính nên
   * triệt tiêu nhau, đúng bất biến số 9 (số dư là số dư **thuần**).
   */
  async summary(id: string): Promise<PartySummaryView> {
    const party = await this.findById(id);

    const rows = await this.dataSource.query<
      {
        account_id: string;
        account_code: string;
        account_name: string;
        debit: string;
        credit: string;
      }[]
    >(
      `SELECT a.id AS account_id,
              a.code AS account_code,
              a.name AS account_name,
              COALESCE(SUM(l.debit), 0) AS debit,
              COALESCE(SUM(l.credit), 0) AS credit
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN accounts a ON a.id = l.account_id
        WHERE l.party_id = $1
          AND e.status::text = ANY($2)
        GROUP BY a.id, a.code, a.name
        ORDER BY a.code`,
      [party.id, [...LEDGER_STATUSES]],
    );

    const accounts: PartyAccountBalance[] = rows.map((row) => {
      const net = toMoney(row.debit).minus(toMoney(row.credit));
      return {
        accountId: row.account_id,
        accountCode: row.account_code,
        accountName: row.account_name,
        debit: moneyToString(toMoney(row.debit)),
        credit: moneyToString(toMoney(row.credit)),
        netDebit: moneyToString(net),
      };
    });

    const totalDebit = accounts.reduce(
      (sum, account) => sum.plus(toMoney(account.debit)),
      new Decimal(0),
    );
    const totalCredit = accounts.reduce(
      (sum, account) => sum.plus(toMoney(account.credit)),
      new Decimal(0),
    );

    return {
      partyId: party.id,
      partyCode: party.code,
      partyName: party.name,
      partyType: party.type,
      isActive: party.isActive,
      journalLines: await this.usageCount(party.id),
      accounts,
      totals: {
        debit: moneyToString(totalDebit),
        credit: moneyToString(totalCredit),
        netDebit: moneyToString(totalDebit.minus(totalCredit)),
      },
    };
  }

  /** Số dòng định khoản đang gắn đối tượng này (đếm trực tiếp trên `journal_lines`). */
  async usageCount(partyId: string): Promise<number> {
    const rows = await this.dataSource.query<{ count: number | string }[]>(
      'SELECT COUNT(*) AS count FROM journal_lines WHERE party_id = $1',
      [partyId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  // ---------------------------------------------------------------- helpers

  private async assertCodeAvailable(
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.parties.findOne({ where: { code } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Mã đối tượng "${code}" đã tồn tại`);
    }
  }
}
