import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity.js';
import { AccountDefaultScope } from '../../common/enums/account-default-scope.enum.js';

/**
 * Luật mặc định tài khoản (mục 10.A) — "loại hàng hóa/dịch vụ nào ghi vào tài khoản nào".
 *
 * Vì sao là **dữ liệu** chứ không hardcode trong service: cách phân loại doanh thu/chi
 * phí khác nhau theo từng doanh nghiệp, và người dùng phải sửa được **không cần deploy
 * lại**. `tax_codes` (mục 10.C) chỉ cấp thông tin thuế — nó **không** quyết định tài khoản.
 *
 * Bất biến: `(scope, category)` duy nhất — nhờ vậy việc tra cứu là **một** kết quả xác
 * định, không phụ thuộc thứ tự và không cần cột `priority` (một luật, một kết quả).
 *
 * Thứ tự giải tài khoản khi lập chứng từ (xem `AccountDefaultsService.resolveLineAccount`):
 *   1. tài khoản người dùng chỉ định trên dòng (cần quyền),
 *   2. luật theo đúng `category`,
 *   3. luật dành cho mọi loại (`*`),
 *   4. mặc định của hệ thống theo tiền tố mã tài khoản.
 */
@Entity('account_default_rules')
@Index('account_default_rules_scope_category_uidx', ['scope', 'category'], {
  unique: true,
})
export class AccountDefaultRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    type: 'enum',
    enum: AccountDefaultScope,
    enumName: 'account_default_scope_enum',
  })
  scope: AccountDefaultScope;

  /**
   * Loại hàng hóa/dịch vụ tự khai (vd `dịch vụ tư vấn`), hoặc `*` = mọi loại.
   * Đã trim và hạ chữ thường khi lưu để tra cứu không phân biệt hoa thường.
   */
  @Column({ type: 'varchar', length: 64 })
  category: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** Tài khoản đích — phải là tài khoản **lá, đang hoạt động**. */
  @ManyToOne(() => Account, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

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
