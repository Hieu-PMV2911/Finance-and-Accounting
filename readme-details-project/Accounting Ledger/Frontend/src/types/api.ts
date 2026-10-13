export type Role = 'admin' | 'maker' | 'checker' | 'poster'

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense'

export type NormalBalance = 'debit' | 'credit'

/** Payload gắn vào request.user sau khi xác thực JWT. */
export interface AuthUser {
  id: string
  email: string
  roles: Role[]
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export interface User {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  roles: Role[]
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Account {
  id: string
  code: string
  name: string
  type: AccountType
  parentId: string | null
  isPostable: boolean
  isActive: boolean
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountNode {
  id: string
  code: string
  name: string
  type: AccountType
  parentId: string | null
  isPostable: boolean
  isActive: boolean
  description: string | null
  normalBalance: NormalBalance
  level: number
  children: AccountNode[]
}

/** Các trường tối thiểu để hiển thị/sửa tài khoản (Account và AccountNode đều khớp). */
export type AccountLike = Pick<
  Account,
  | 'id'
  | 'code'
  | 'name'
  | 'type'
  | 'parentId'
  | 'isPostable'
  | 'isActive'
  | 'description'
>

export interface AccountFilters {
  type?: AccountType
  isActive?: boolean
  search?: string
  parentId?: string
}

export interface CreateAccountPayload {
  code: string
  name: string
  type: AccountType
  parentId?: string | null
  isPostable?: boolean
  isActive?: boolean
  description?: string
}

export type UpdateAccountPayload = Partial<CreateAccountPayload>

export interface CreateUserPayload {
  email: string
  password: string
  fullName?: string
  roles?: Role[]
}

export interface UpdateUserPayload {
  fullName?: string
  roles?: Role[]
  isActive?: boolean
}

export interface UpdateProfilePayload {
  fullName?: string
  avatarUrl?: string | null
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export const ROLES: Role[] = ['admin', 'maker', 'checker', 'poster']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Quản trị',
  maker: 'Người lập',
  checker: 'Người duyệt',
  poster: 'Người ghi sổ',
}

export const ACCOUNT_TYPES: AccountType[] = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Tài sản',
  liability: 'Nợ phải trả',
  equity: 'Vốn chủ sở hữu',
  revenue: 'Doanh thu',
  expense: 'Chi phí',
}

// ---------------------------------------------------------------------------
// Mục 4 — Kỳ kế toán (fiscal period)
// ---------------------------------------------------------------------------

export type FiscalPeriodStatus = 'open' | 'locked' | 'closed'

export interface FiscalPeriod {
  id: string
  code: string
  name: string
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD` */
  endDate: string
  status: FiscalPeriodStatus
  notes: string | null
  createdBy: string | null
  lockedAt: string | null
  lockedBy: string | null
  closedAt: string | null
  closedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface FiscalPeriodFilters {
  status?: FiscalPeriodStatus
  year?: number
  /** Lọc kỳ chứa ngày này (`YYYY-MM-DD`). */
  date?: string
  search?: string
}

export interface CreateFiscalPeriodPayload {
  code: string
  name: string
  startDate: string
  endDate: string
  notes?: string
}

/** Không cho đổi `code` sau khi tạo; trạng thái đi qua endpoint open/lock/close. */
export interface UpdateFiscalPeriodPayload {
  name?: string
  startDate?: string
  endDate?: string
  /** Gửi `null` để xóa ghi chú. */
  notes?: string | null
}

/** Số dư một tài khoản trong một kỳ (đã tính sẵn dư cuối kỳ). */
export interface AccountBalance {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  openingDebit: string
  openingCredit: string
  debitTotal: string
  creditTotal: string
  /** Dư cuối kỳ phần Nợ — `(Nợ đầu − Có đầu) + (Nợ PS − Có PS)` khi dương. */
  closingDebit: string
  /** Dư cuối kỳ phần Có — trị tuyệt đối khi số dư thuần âm. */
  closingCredit: string
}

export const FISCAL_PERIOD_STATUSES: FiscalPeriodStatus[] = [
  'open',
  'locked',
  'closed',
]

export const FISCAL_PERIOD_STATUS_LABELS: Record<FiscalPeriodStatus, string> = {
  open: 'Đang mở',
  locked: 'Tạm khóa',
  closed: 'Đã chốt',
}

// ---------------------------------------------------------------------------
// Mục 5 — Bút toán (journal entry)
// ---------------------------------------------------------------------------

export type JournalStatus = 'draft' | 'approved' | 'posted' | 'reversed'

export interface JournalLine {
  id: string
  entryId: string
  lineNo: number
  accountId: string
  account?: Account
  debit: string
  credit: string
  description: string | null
}

export interface JournalEntry {
  id: string
  /** Số hiệu cấp khi ghi sổ (vd `JE-2026-01-0001`); `null` khi còn nháp. */
  entryNo: string | null
  /** `YYYY-MM-DD` */
  date: string
  periodId: string
  period?: FiscalPeriod
  description: string
  reference: string | null
  status: JournalStatus
  totalDebit: string
  totalCredit: string
  idempotencyKey: string | null
  createdBy: string
  approvedBy: string | null
  approvedAt: string | null
  postedBy: string | null
  postedAt: string | null
  /** Bút toán này là bút toán đảo → trỏ về bản gốc. */
  reversalOfEntryId: string | null
  /** Bút toán này đã bị đảo → trỏ về bút toán đảo. */
  reversedByEntryId: string | null
  lines: JournalLine[]
  createdAt: string
  updatedAt: string
}

export interface CreateJournalLinePayload {
  accountId: string
  debit?: string
  credit?: string
  description?: string
}

export interface CreateJournalEntryPayload {
  date: string
  description: string
  reference?: string
  /** Gửi lại cùng khóa sẽ trả về bút toán đã tạo thay vì tạo trùng. */
  idempotencyKey?: string
  lines: CreateJournalLinePayload[]
}

export interface UpdateJournalEntryPayload {
  date?: string
  description?: string
  reference?: string | null
  /** Nếu gửi thì thay toàn bộ dòng cũ. */
  lines?: CreateJournalLinePayload[]
}

export interface JournalFilters {
  status?: JournalStatus
  periodId?: string
  accountId?: string
  fromDate?: string
  toDate?: string
  search?: string
  limit?: number
  offset?: number
}

export interface ReverseJournalPayload {
  /** Bắt buộc — lưu vết kiểm toán. */
  reason: string
  date?: string
}

export const JOURNAL_STATUSES: JournalStatus[] = [
  'draft',
  'approved',
  'posted',
  'reversed',
]

export const JOURNAL_STATUS_LABELS: Record<JournalStatus, string> = {
  draft: 'Nháp',
  approved: 'Đã xác nhận',
  posted: 'Đã ghi sổ',
  reversed: 'Đã đảo',
}
