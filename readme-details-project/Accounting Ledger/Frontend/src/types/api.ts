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

export type SourceType =
  | 'manual'
  | 'sales_invoice'
  | 'vendor_bill'
  | 'payment'
  | 'bank_transaction'
  | 'provider_event'

/** Nhãn hiển thị cho loại chứng từ nguồn (truy vết, mục 10.0). */
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  manual: 'Bút toán nhập tay',
  sales_invoice: 'Hóa đơn bán',
  vendor_bill: 'Hóa đơn mua',
  payment: 'Phiếu thu / chi',
  bank_transaction: 'Dòng sao kê ngân hàng',
  provider_event: 'Sự kiện thanh toán',
}

export interface JournalLine {
  id: string
  entryId: string
  lineNo: number
  accountId: string
  account?: Account
  /** Đối tượng của sổ cái phụ (chỉ dùng với tài khoản công nợ 131/331). */
  partyId: string | null
  party?: Party
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
  sourceType: SourceType
  sourceId: string | null
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
  partyId?: string | null
}

export interface CreateJournalEntryPayload {
  date: string
  description: string
  reference?: string
  sourceType?: SourceType
  sourceId?: string
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

// ---------------------------------------------------------------------------
// Phạm vi báo cáo dùng chung (mục 6 & 7)
// ---------------------------------------------------------------------------

/**
 * Phạm vi truy vấn sổ cái / báo cáo.
 *
 * Backend nhận **hoặc** `periodId` **hoặc** cặp `fromDate` + `toDate` — không
 * trộn cả hai. Component gửi lên phải đảm bảo chỉ một trong hai cách.
 */
export interface ReportScope {
  periodId?: string
  /** `YYYY-MM-DD` */
  fromDate?: string
  /** `YYYY-MM-DD` */
  toDate?: string
}

// ---------------------------------------------------------------------------
// Mục 6 — Sổ cái (ledger)
// ---------------------------------------------------------------------------

/** Một dòng phát sinh trên sổ cái chi tiết, kèm số dư lũy kế sau dòng đó. */
export interface GeneralLedgerLine {
  journalEntryId: string
  entryNo: string | null
  /** `YYYY-MM-DD` */
  date: string
  description: string
  reference: string | null
  lineDescription: string | null
  debit: string
  credit: string
  /** Số dư lũy kế (thuần) sau dòng này — phần dư Nợ. */
  balanceDebit: string
  /** Số dư lũy kế (thuần) sau dòng này — phần dư Có. */
  balanceCredit: string
}

export interface GeneralLedger {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  normalBalance: NormalBalance
  fromDate: string
  toDate: string
  periodId: string | null
  periodCode: string | null
  openingDebit: string
  openingCredit: string
  lines: GeneralLedgerLine[]
  totalDebit: string
  totalCredit: string
  closingDebit: string
  closingCredit: string
}

export interface TrialBalanceRow {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  openingDebit: string
  openingCredit: string
  debitTotal: string
  creditTotal: string
  closingDebit: string
  closingCredit: string
}

export interface TrialBalanceTotals {
  openingDebit: string
  openingCredit: string
  debitTotal: string
  creditTotal: string
  closingDebit: string
  closingCredit: string
}

/** Bảng cân đối số phát sinh. `balanced` = Σ dư cuối Nợ = Σ dư cuối Có. */
export interface TrialBalance {
  fromDate: string
  toDate: string
  periodId: string | null
  periodCode: string | null
  rows: TrialBalanceRow[]
  totals: TrialBalanceTotals
  balanced: boolean
}

/** Chênh lệch giữa số dư đã lưu và số dư tái lập từ bút toán. */
export interface ReconciliationRow {
  accountId: string
  accountCode: string
  accountName: string
  storedOpeningNet: string
  computedOpeningNet: string
  storedDebitTotal: string
  computedDebitTotal: string
  storedCreditTotal: string
  computedCreditTotal: string
  /** Các trường lệch (rỗng ⇒ dòng này khớp). */
  mismatched: string[]
}

/** Kết quả đối chiếu `account_balances` với `journal_lines` của một kỳ. */
export interface Reconciliation {
  periodId: string
  periodCode: string
  periodStartDate: string
  periodEndDate: string
  checkedAt: string
  consistent: boolean
  checkedAccounts: number
  differences: ReconciliationRow[]
}

// ---------------------------------------------------------------------------
// Mục 7 — Báo cáo tài chính (reports)
// ---------------------------------------------------------------------------

export type ReportKind = 'profit-and-loss' | 'balance-sheet' | 'cash-flow'
export type ReportFormat = 'xlsx' | 'pdf'

/** Một dòng tài khoản trên báo cáo (số tiền đã theo chiều trình bày). */
export interface ReportAccountLine {
  accountId: string
  accountCode: string
  accountName: string
  amount: string
}

/** Một nhóm chỉ tiêu (các dòng + tổng nhóm). */
export interface ReportSection {
  lines: ReportAccountLine[]
  total: string
}

export interface ProfitAndLossReport {
  fromDate: string
  toDate: string
  periodId: string | null
  periodCode: string | null
  revenue: ReportSection
  expense: ReportSection
  netProfit: string
  /** Tỷ suất lợi nhuận trên doanh thu (%), `null` khi kỳ không có doanh thu. */
  netProfitMargin: string | null
}

export interface BalanceSheetReport {
  asOfDate: string
  periodId: string | null
  periodCode: string | null
  assets: ReportSection
  liabilities: ReportSection
  equity: ReportSection
  retainedEarnings: string
  totalAssets: string
  totalLiabilitiesAndEquity: string
  balanced: boolean
}

export type CashFlowGroupKey = 'operating' | 'investing' | 'financing'

export interface CashFlowItem {
  accountId: string
  accountCode: string
  accountName: string
  amount: string
}

export interface CashFlowGroup {
  key: CashFlowGroupKey
  label: string
  inflow: string
  outflow: string
  net: string
  items: CashFlowItem[]
}

export interface CashFlowReport {
  fromDate: string
  toDate: string
  periodId: string | null
  periodCode: string | null
  openingCash: string
  netChange: string
  closingCash: string
  groups: CashFlowGroup[]
}

export const REPORT_KINDS: ReportKind[] = [
  'profit-and-loss',
  'balance-sheet',
  'cash-flow',
]

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  'profit-and-loss': 'Kết quả kinh doanh',
  'balance-sheet': 'Bảng cân đối kế toán',
  'cash-flow': 'Lưu chuyển tiền tệ',
}

export const REPORT_FORMATS: ReportFormat[] = ['xlsx', 'pdf']

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  xlsx: 'Excel (.xlsx)',
  pdf: 'PDF (.pdf)',
}

// ---------------------------------------------------------------------------
// Mục 8 — Kiểm toán (audit)
// ---------------------------------------------------------------------------

export type AuditAction = 'create' | 'update' | 'delete'

export interface AuditLog {
  id: string
  actorId: string | null
  actorEmail: string | null
  action: AuditAction
  /** Tên bảng dữ liệu bị thay đổi (vd `journal_entries`). */
  entity: string
  entityId: string | null
  /** Ảnh chụp trước khi thay đổi (chỉ trường vô hướng). */
  before: Record<string, unknown> | null
  /** Ảnh chụp sau khi thay đổi (chỉ trường vô hướng). */
  after: Record<string, unknown> | null
  method: string | null
  path: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditFilters {
  entity?: string
  entityId?: string
  actorId?: string
  action?: AuditAction
  /** `YYYY-MM-DD` */
  fromDate?: string
  /** `YYYY-MM-DD` */
  toDate?: string
  search?: string
  limit?: number
  offset?: number
}

/** Một dòng định khoản trong kết quả truy vết. */
export interface TraceJournalLine {
  lineNo: number
  accountCode: string
  accountName: string
  debit: string
  credit: string
  description: string | null
}

/** Truy vết một bút toán: báo cáo → bút toán → chứng từ nguồn. */
export interface JournalSource {
  type: SourceType
  id: string
  /** Số chứng từ đọc từ chính bảng nghiệp vụ; `null` khi loại nguồn chưa có bảng tra. */
  code: string | null
}

export interface JournalTraceability {
  entity: 'journal_entries'
  entityId: string
  journal: {
    id: string
    entryNo: string | null
    date: string
    status: string
    description: string
    periodId: string
    periodCode: string | null
    totalDebit: string
    totalCredit: string
    createdBy: string
    approvedBy: string | null
    approvedAt: string | null
    postedBy: string | null
    postedAt: string | null
    reversalOfEntryId: string | null
    reversedByEntryId: string | null
  }
  lines: TraceJournalLine[]
  /** Số chứng từ nguồn (hóa đơn / phiếu thu-chi) để truy ngược ra giấy tờ gốc. */
  sourceDocument: string | null
  /** Chứng từ nguồn có cấu trúc. */
  source: JournalSource | null
  /** Vết kiểm toán của bút toán này, mới nhất trước. */
  history: AuditLog[]
}

export const AUDIT_ACTIONS: AuditAction[] = ['create', 'update', 'delete']

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
}

/** Nhãn tiếng Việt cho tên bảng dữ liệu trong vết kiểm toán. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  users: 'Người dùng',
  accounts: 'Tài khoản kế toán',
  fiscal_periods: 'Kỳ kế toán',
  journal_entries: 'Bút toán',
  journal_lines: 'Dòng định khoản',
}

// ---------------------------------------------------------------------------
// Mục 9 — Xử lý bất đồng bộ (Queue + Schedule)
// ---------------------------------------------------------------------------

export type JobQueueName = 'reports' | 'maintenance' | 'notifications' | 'webhooks'

export type JobRunStatus = 'pending' | 'active' | 'completed' | 'failed'

export type JobTrigger = 'schedule' | 'api' | 'system'

export type JobName =
  | 'generate-report'
  | 'balance-snapshot'
  | 'integrity-check'
  | 'send-notification'
  | 'debt-reminder'
  | 'overdue-invoice-sweep'
  | 'deliver-webhook'
  | 'webhook-sweep'

/** Một lượt chạy job (bảng `job_runs`). */
export interface JobRun {
  id: string
  queue: JobQueueName
  jobName: JobName | string
  status: JobRunStatus
  trigger: JobTrigger
  triggeredBy: string | null
  triggeredByEmail: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  maxAttempts: number
  progress: number
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  createdAt: string
}

export interface JobRunFilters {
  queue?: JobQueueName
  status?: JobRunStatus
  trigger?: JobTrigger
  jobName?: string
  limit?: number
  offset?: number
}

export interface QueueCounts {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
}

/** Tình trạng một hàng đợi — đọc trực tiếp từ Redis ở backend. */
export interface QueueOverview {
  queue: JobQueueName
  label: string
  counts: QueueCounts
  /** `false` khi backend không kết nối được Redis. */
  reachable: boolean
}

export interface JobsOverview {
  queues: QueueOverview[]
  runs: Record<JobRunStatus, number>
  schedulingEnabled: boolean
}

/** Một lịch định kỳ (cron) kèm lần chạy gần nhất / kế tiếp. */
export interface ScheduleView {
  name: string
  label: string
  description: string
  cron: string
  queue: JobQueueName
  jobName: JobName
  lastRunAt: string | null
  lastStatus: JobRunStatus | null
  nextRunAt: string | null
}

/** Một vi phạm bất biến do job kiểm tra phát hiện. */
export interface IntegrityViolation {
  code: string
  severity: 'info' | 'warning' | 'critical'
  reference: string
  message: string
  details: Record<string, unknown>
}

/** Phạm vi + định dạng khi xếp job sinh báo cáo nền. */
export interface EnqueueReportPayload extends ReportScope {
  kind?: ReportKind
  /** Bỏ trống ⇒ job chỉ tính số liệu, không sinh file. */
  format?: ReportFormat
}

export interface BalanceSnapshotPayload {
  periodId?: string
  repair?: boolean
}

export const JOB_QUEUE_LABELS: Record<JobQueueName, string> = {
  reports: 'Sinh báo cáo',
  maintenance: 'Bảo trì định kỳ',
  notifications: 'Gửi thông báo',
  webhooks: 'Webhook',
}

export const JOB_RUN_STATUSES: JobRunStatus[] = [
  'pending',
  'active',
  'completed',
  'failed',
]

export const JOB_RUN_STATUS_LABELS: Record<JobRunStatus, string> = {
  pending: 'Đang chờ',
  active: 'Đang chạy',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
}

export const JOB_TRIGGER_LABELS: Record<JobTrigger, string> = {
  schedule: 'Định kỳ',
  api: 'Thủ công',
  system: 'Hệ thống',
}

export const JOB_NAME_LABELS: Record<string, string> = {
  'generate-report': 'Sinh báo cáo',
  'balance-snapshot': 'Chốt số dư',
  'integrity-check': 'Kiểm tra bất biến',
  'send-notification': 'Gửi thông báo',
  'debt-reminder': 'Nhắc công nợ',
  'overdue-invoice-sweep': 'Quét hóa đơn quá hạn',
  'deliver-webhook': 'Giao webhook',
  'webhook-sweep': 'Quét webhook treo',
}

// ------------------------------------------------------------ thông báo

export type AppNotificationType =
  | 'debt-reminder'
  | 'overdue-invoice'
  | 'report-ready'
  | 'integrity-alert'
  | 'system'

export type AppNotificationSeverity = 'info' | 'warning' | 'critical'
export type AppNotificationStatus = 'unread' | 'read'
/** `poster` = người ghi sổ **và** quản trị (cảnh báo cần hành động ghi sổ). */
export type AppNotificationAudience = 'all' | 'admin' | 'poster' | 'targeted'

/** Thông báo trong hệ thống (bảng `notifications`). */
export interface AppNotification {
  id: string
  type: AppNotificationType
  severity: AppNotificationSeverity
  status: AppNotificationStatus
  audience: AppNotificationAudience
  targetUserId: string | null
  title: string
  body: string
  data: Record<string, unknown> | null
  readAt: string | null
  readBy: string | null
  createdAt: string
}

export interface NotificationFilters {
  type?: AppNotificationType
  status?: AppNotificationStatus
  severity?: AppNotificationSeverity
  search?: string
  limit?: number
  offset?: number
}

export const NOTIFICATION_TYPE_LABELS: Record<AppNotificationType, string> = {
  'debt-reminder': 'Nhắc công nợ',
  'overdue-invoice': 'Hóa đơn quá hạn',
  'report-ready': 'Báo cáo sẵn sàng',
  'integrity-alert': 'Cảnh báo bất biến',
  system: 'Hệ thống',
}

export const NOTIFICATION_SEVERITY_LABELS: Record<
  AppNotificationSeverity,
  string
> = {
  info: 'Thông tin',
  warning: 'Cảnh báo',
  critical: 'Nghiêm trọng',
}

export const NOTIFICATION_SEVERITIES: AppNotificationSeverity[] = [
  'info',
  'warning',
  'critical',
]

// -------------------------------------------------------------
// Mục 10.0 — Đối tượng (parties) & sổ cái phụ
// -------------------------------------------------------------

export type PartyType = 'customer' | 'vendor' | 'both'

export interface Party {
  id: string
  code: string
  type: PartyType
  name: string
  taxCode: string | null
  address: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  paymentTermDays: number
  creditLimit: string | null
  isActive: boolean
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface PartyFilters {
  type?: PartyType
  isActive?: boolean
  search?: string
}

export interface CreatePartyPayload {
  code: string
  type: PartyType
  name: string
  taxCode?: string
  address?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  paymentTermDays?: number
  creditLimit?: string
  isActive?: boolean
  description?: string
}

export type UpdatePartyPayload = Partial<CreatePartyPayload>

export interface PartyUsage {
  partyId: string
  journalLines: number
  deletable: boolean
}

export interface SubLedgerLine {
  journalEntryId: string
  entryNo: string | null
  date: string
  description: string
  reference: string | null
  accountId: string
  accountCode: string
  accountName: string
  lineDescription: string | null
  debit: string
  credit: string
  balanceDebit: string
  balanceCredit: string
}

export interface SubLedger {
  partyId: string
  partyCode: string
  partyName: string
  partyType: PartyType
  fromDate: string
  toDate: string
  periodId: string | null
  periodCode: string | null
  accountCodes: string[]
  openingDebit: string
  openingCredit: string
  lines: SubLedgerLine[]
  totalDebit: string
  totalCredit: string
  closingDebit: string
  closingCredit: string
  netClosing: string
}

export interface SubLedgerQuery extends ReportScope {
  partyId: string
  accountId?: string
  limit?: number
  offset?: number
}

export const PARTY_TYPES: PartyType[] = ['customer', 'vendor', 'both']

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  customer: 'Khách hàng',
  vendor: 'Nhà cung cấp',
  both: 'Khách hàng & Nhà cung cấp',
}

// ------------------------------------------------------------- webhook

export type WebhookEventType =
  | 'journal.posted'
  | 'journal.reversed'
  | 'period.closed'
  | 'integrity.violation'
  | 'sales_invoice.posted'
  | 'vendor_bill.posted'
  | 'payment.posted'
  | 'invoice.overdue'
  | 'ping'

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed'

export type WebhookEventStatus =
  | 'processed'
  | 'duplicate'
  | 'late'
  | 'rejected'

/** Endpoint nhận webhook — backend **không** trả về khóa ký. */
export interface WebhookEndpoint {
  id: string
  name: string
  url: string
  /** Mảng rỗng = nhận mọi sự kiện. */
  events: WebhookEventType[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateWebhookEndpointPayload {
  name: string
  url: string
  /** Bỏ trống ⇒ backend tự sinh khóa ký HMAC-SHA256. */
  secret?: string
  events?: WebhookEventType[]
  isActive?: boolean
}

export type UpdateWebhookEndpointPayload = Partial<CreateWebhookEndpointPayload>

/** Một lần giao webhook ra hệ thống ngoài. */
export interface WebhookDelivery {
  id: string
  endpointId: string
  endpointName: string | null
  endpointUrl: string | null
  eventType: WebhookEventType
  idempotencyKey: string
  status: WebhookDeliveryStatus
  attempts: number
  maxAttempts: number
  responseStatus: number | null
  responseBody: string | null
  lastError: string | null
  nextAttemptAt: string | null
  deliveredAt: string | null
  createdAt: string
  updatedAt: string
}

/** Webhook nhận từ hệ thống ngoài (kể cả lần bị bỏ qua). */
export interface WebhookInboundEvent {
  id: string
  externalId: string
  eventType: string
  resourceRef: string
  occurredAt: string
  status: WebhookEventStatus
  reason: string | null
  payload: Record<string, unknown> | null
  receivedAt: string
}

export interface WebhookStats {
  totalEndpoints: number
  activeEndpoints: number
  pendingDeliveries: number
  failedDeliveries: number
  eventsReceived: number
  lateEvents: number
}

export interface EmitWebhookEventPayload {
  eventType: WebhookEventType
  resourceRef?: string
  data?: Record<string, unknown>
  endpointIds?: string[]
}

export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  'journal.posted',
  'journal.reversed',
  'period.closed',
  'integrity.violation',
  'sales_invoice.posted',
  'vendor_bill.posted',
  'payment.posted',
  'invoice.overdue',
  'ping',
]

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  'journal.posted': 'Bút toán đã ghi sổ',
  'journal.reversed': 'Bút toán đã đảo',
  'period.closed': 'Kỳ kế toán đã chốt',
  'integrity.violation': 'Vi phạm bất biến',
  'sales_invoice.posted': 'Hóa đơn bán đã ghi sổ',
  'vendor_bill.posted': 'Hóa đơn mua đã ghi sổ',
  'payment.posted': 'Phiếu thu/chi đã ghi sổ',
  'invoice.overdue': 'Hóa đơn quá hạn',
  ping: 'Thử nghiệm',
}

export const WEBHOOK_DELIVERY_STATUS_LABELS: Record<
  WebhookDeliveryStatus,
  string
> = {
  pending: 'Đang chờ',
  delivered: 'Đã giao',
  failed: 'Thất bại',
}

export const WEBHOOK_EVENT_STATUS_LABELS: Record<WebhookEventStatus, string> = {
  processed: 'Đã xử lý',
  duplicate: 'Trùng lặp',
  late: 'Đến trễ',
  rejected: 'Bị từ chối',
}

// -------------------------------------------------------------
// Mục 10.A — Hóa đơn bán/mua, phiếu thu-chi, phân bổ, tuổi nợ
// -------------------------------------------------------------

/**
 * Vòng đời chứng từ nghiệp vụ: `draft → approved → posted → voided`.
 *
 * Hóa đơn bán, hóa đơn mua và phiếu thu/chi dùng **chung** vòng đời này — nên
 * dùng chung kiểu và nhãn, tránh ba bảng nhãn lệch nhau khi backend đổi.
 */
export type DocumentStatus = 'draft' | 'approved' | 'posted' | 'voided'

export const DOCUMENT_STATUSES: DocumentStatus[] = [
  'draft',
  'approved',
  'posted',
  'voided',
]

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Nháp',
  approved: 'Đã xác nhận',
  posted: 'Đã ghi sổ',
  voided: 'Đã hủy',
}

/** Một dòng chứng từ (hàng hóa/dịch vụ) — tiền luôn là chuỗi `NUMERIC(19,4)`. */
export interface DocumentLine {
  id: string
  lineNo: number
  accountId: string
  description: string | null
  quantity: string
  unitPrice: string
  amount: string
}

/**
 * Dòng chứng từ khi gửi lên server.
 *
 * `accountId` bỏ trống ⇒ backend giải theo **luật mặc định tài khoản** (mục 10.A);
 * chỉ gửi khi có quyền `admin`/`poster` và thật sự muốn ghi đè.
 */
export interface DocumentLinePayload {
  accountId?: string
  category?: string
  description?: string
  quantity?: string
  unitPrice?: string
  amount: string
}

export interface SalesInvoice {
  id: string
  invoiceNo: string
  partyId: string
  party?: Party
  date: string
  dueDate: string | null
  description: string | null
  currency: string | null
  status: DocumentStatus
  subtotal: string
  taxAmount: string
  total: string
  receivableAccountId: string | null
  journalEntryId: string | null
  reversalJournalEntryId: string | null
  voidReason: string | null
  createdAt: string
  updatedAt: string
  /** Chỉ có ở endpoint chi tiết (`GET /sales-invoices/:id`). */
  lines?: DocumentLine[]
}

export interface SalesInvoiceFilters {
  partyId?: string
  status?: DocumentStatus
  invoiceNo?: string
  fromDate?: string
  toDate?: string
}

export interface CreateSalesInvoicePayload {
  invoiceNo: string
  partyId: string
  date: string
  dueDate?: string
  description?: string
  currency?: string
  subtotal: string
  taxAmount?: string
  total: string
  receivableAccountId?: string
  lines: DocumentLinePayload[]
}

export type UpdateSalesInvoicePayload = Partial<CreateSalesInvoicePayload>

export interface VendorBill {
  id: string
  billNo: string
  partyId: string
  party?: Party
  date: string
  dueDate: string | null
  description: string | null
  currency: string | null
  status: DocumentStatus
  subtotal: string
  taxAmount: string
  total: string
  payableAccountId: string | null
  journalEntryId: string | null
  reversalJournalEntryId: string | null
  voidReason: string | null
  createdAt: string
  updatedAt: string
  /** Chỉ có ở endpoint chi tiết (`GET /vendor-bills/:id`). */
  lines?: DocumentLine[]
}

export interface VendorBillFilters {
  partyId?: string
  status?: DocumentStatus
  billNo?: string
  fromDate?: string
  toDate?: string
}

export interface CreateVendorBillPayload {
  billNo: string
  partyId: string
  date: string
  dueDate?: string
  description?: string
  currency?: string
  subtotal: string
  taxAmount?: string
  total: string
  payableAccountId?: string
  lines: DocumentLinePayload[]
}

export type UpdateVendorBillPayload = Partial<CreateVendorBillPayload>

/** Hủy chứng từ — lý do **bắt buộc** để vết kiểm toán giải thích được. */
export interface VoidDocumentPayload {
  reason: string
  /** Ngày hạch toán của bút toán đảo; bỏ trống ⇒ ngày chứng từ. */
  date?: string
}

// ----- Phiếu thu / phiếu chi -----

export type PaymentDirection = 'receipt' | 'payment'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'other'
export type PaymentStatus = DocumentStatus

export const PAYMENT_DIRECTIONS: PaymentDirection[] = ['receipt', 'payment']

export const PAYMENT_DIRECTION_LABELS: Record<PaymentDirection, string> = {
  receipt: 'Phiếu thu',
  payment: 'Phiếu chi',
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'other',
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  other: 'Khác',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> =
  DOCUMENT_STATUS_LABELS

export interface Payment {
  id: string
  code: string
  direction: PaymentDirection
  partyId: string
  party?: Party
  date: string
  amount: string
  currency: string | null
  method: PaymentMethod
  reference: string | null
  description: string | null
  cashAccountId: string | null
  idempotencyKey: string | null
  status: PaymentStatus
  journalEntryId: string | null
  reversalJournalEntryId: string | null
  voidReason: string | null
  createdAt: string
  updatedAt: string
}

export interface PaymentFilters {
  direction?: PaymentDirection
  status?: PaymentStatus
  method?: PaymentMethod
  partyId?: string
  fromDate?: string
  toDate?: string
  search?: string
}

export interface CreatePaymentPayload {
  code: string
  direction: PaymentDirection
  partyId: string
  date: string
  amount: string
  currency?: string
  method: PaymentMethod
  reference?: string
  description?: string
  cashAccountId?: string
  idempotencyKey?: string
}

export type UpdatePaymentPayload = Partial<CreatePaymentPayload>

/** Loại chứng từ đích mà phiếu thu/chi có thể phân bổ vào. */
export type AllocationTargetType = 'sales_invoice' | 'vendor_bill'

export const ALLOCATION_TARGET_LABELS: Record<AllocationTargetType, string> = {
  sales_invoice: 'Hóa đơn bán',
  vendor_bill: 'Hóa đơn mua',
}

export interface PaymentAllocation {
  id: string
  targetType: AllocationTargetType
  targetId: string
  /** Số chứng từ đích (đọc được, không phải id). */
  targetCode: string | null
  amount: string
  createdAt: string
}

export interface CreateAllocationPayload {
  targetType: AllocationTargetType
  targetId: string
  amount: string
}

// ----- Tuổi nợ (aging) -----

export type AgingBucketKey =
  | 'not_due'
  | 'overdue_1_30'
  | 'overdue_31_60'
  | 'overdue_61_90'
  | 'overdue_over_90'
  | 'no_due_date'

export interface AgingBucket {
  key: AgingBucketKey
  label: string
  amount: string
}

export interface AgingLine {
  targetType: AllocationTargetType
  targetId: string
  code: string
  partyId: string
  partyCode: string
  partyName: string
  date: string
  dueDate: string | null
  total: string
  allocated: string
  /** `total − allocated` — số còn phải thu/phải trả. */
  outstanding: string
  /** Số ngày quá hạn tại `asOfDate`; âm = chưa đến hạn; `null` = không có hạn. */
  daysOverdue: number | null
  bucket: AgingBucketKey
}

export interface AgingPartyRow {
  partyId: string
  partyCode: string
  partyName: string
  buckets: Record<AgingBucketKey, string>
  total: string
}

export interface AgingView {
  targetType: AllocationTargetType
  asOfDate: string
  buckets: AgingBucket[]
  totalOutstanding: string
  lines: AgingLine[]
  parties: AgingPartyRow[]
}

export interface AgingFilters {
  asOfDate?: string
  partyId?: string
  includeSettled?: boolean
}
