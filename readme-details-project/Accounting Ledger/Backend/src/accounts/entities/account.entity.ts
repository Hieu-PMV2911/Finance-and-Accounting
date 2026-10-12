import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AccountType } from '../../common/enums/account-type.enum.js';

/**
 * Tài khoản kế toán (Chart of Accounts).
 *
 * Cây phân cấp tự tham chiếu qua `parent_id`. Bất biến:
 * - `code` là duy nhất.
 * - Tài khoản con phải cùng `type` với tài khoản cha.
 * - Chỉ tài khoản **lá** (`isPostable = true`) mới được ghi sổ; tài khoản có con
 *   luôn bị đặt `isPostable = false`.
 */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mã tài khoản (vd: 111, 1111, 331). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: AccountType, enumName: 'account_type_enum' })
  type: AccountType;

  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Account, (account) => account.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Account | null;

  @OneToMany(() => Account, (account) => account.parent)
  children: Account[];

  /** Chỉ tài khoản lá mới được ghi sổ. */
  @Column({ name: 'is_postable', type: 'boolean', default: true })
  isPostable: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
