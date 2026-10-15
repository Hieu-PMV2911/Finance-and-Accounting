/**
 * Phạm vi áp dụng của **luật mặc định tài khoản** (mục 10.A).
 *
 * Vì sao cần: hóa đơn bán/mua phải trả lời "doanh thu (chi phí) này ghi vào tài khoản
 * nào?" **trước khi** sinh bút toán. Quyết định thiết kế đã chốt: hệ thống ưu tiên
 * cấu hình theo loại hàng hóa/dịch vụ thay vì bắt người lập chọn tay từng dòng —
 * người lập chọn tay là nguồn sai sót lớn nhất của mọi hệ kế toán.
 */
export enum AccountDefaultScope {
  /** Bán hàng — tài khoản **doanh thu** (511*). */
  SALES = 'sales',
  /** Mua hàng — tài khoản **chi phí** (642*, 627*, …). */
  PURCHASE = 'purchase',
}

export const ALL_ACCOUNT_DEFAULT_SCOPES: readonly AccountDefaultScope[] =
  Object.values(AccountDefaultScope);

export const ACCOUNT_DEFAULT_SCOPE_LABELS: Record<AccountDefaultScope, string> = {
  [AccountDefaultScope.SALES]: 'Bán hàng (doanh thu)',
  [AccountDefaultScope.PURCHASE]: 'Mua hàng (chi phí)',
};

/**
 * `category` đặc biệt: áp dụng cho **mọi** loại hàng hóa/dịch vụ.
 * Dùng làm luật nền khi chưa khai loại cụ thể.
 */
export const ANY_CATEGORY = '*';
