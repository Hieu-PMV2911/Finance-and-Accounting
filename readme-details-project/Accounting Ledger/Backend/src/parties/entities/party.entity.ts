import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PartyType } from '../../common/enums/party-type.enum.js';

/**
 * Đối tượng của sổ cái phụ (mục 10.0) — khách hàng / nhà cung cấp.
 *
 * Vì sao là **một bảng** chứ không phải hai: trong thực tế cùng một đơn vị vừa bán
 * hàng cho mình vừa mua hàng của mình; tách bảng sẽ buộc phải nhân bản dữ liệu và
 * đối chiếu công nợ hai chiều rất khó. Trường `type` chỉ để lọc và gợi ý tài khoản.
 *
 * Đối tượng **không** thay thế tài khoản kế toán: công nợ vẫn nằm trên TK 131/331,
 * đối tượng là *chiều phân tích* gắn vào dòng định khoản (`journal_lines.party_id`).
 *
 * Bất biến:
 * - `code` duy nhất.
 * - Không xóa khi đã phát sinh bút toán — chỉ `isActive = false` (xem `PartiesService.remove`).
 */
@Entity('parties')
export class Party {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mã đối tượng (vd: `KH001`, `NCC001`) — duy nhất. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Index()
  @Column({
    type: 'enum',
    enum: PartyType,
    enumName: 'party_type_enum',
    default: PartyType.CUSTOMER,
  })
  type: PartyType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Mã số thuế — dùng khi lập hóa đơn/thuế (mục 10.C). */
  @Column({ name: 'tax_code', type: 'varchar', length: 32, nullable: true })
  taxCode: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ name: 'contact_name', type: 'varchar', length: 255, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  /**
   * Số ngày được nợ kể từ ngày chứng từ — dùng để tính `dueDate` của hóa đơn và
   * tuổi nợ (mục 10.A).
   */
  @Column({ name: 'payment_term_days', type: 'int', default: 30 })
  paymentTermDays: number;

  /** Hạn mức công nợ (chỉ để cảnh báo, không chặn ghi sổ). `NULL` = không giới hạn. */
  @Column({
    name: 'credit_limit',
    type: 'numeric',
    precision: 19,
    scale: 4,
    nullable: true,
  })
  creditLimit: string | null;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
