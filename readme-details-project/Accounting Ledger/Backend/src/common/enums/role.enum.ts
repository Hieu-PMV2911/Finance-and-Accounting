/**
 * Vai trò kế toán (RBAC).
 *
 * Tách quyền theo nguyên tắc phân tách trách nhiệm (segregation of duties):
 * người lập chứng từ không nên đồng thời là người ghi sổ.
 */
export enum Role {
  /** Quản trị hệ thống: quản lý người dùng, cấu hình. */
  ADMIN = 'admin',
  /** Người lập: tạo/sửa bút toán nháp. */
  MAKER = 'maker',
  /** Người duyệt: xác nhận bút toán nháp. */
  CHECKER = 'checker',
  /** Người ghi sổ: ghi sổ bút toán đã duyệt, khóa kỳ. */
  POSTER = 'poster',
}

export const ALL_ROLES: readonly Role[] = Object.values(Role);
