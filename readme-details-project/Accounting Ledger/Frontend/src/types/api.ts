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
