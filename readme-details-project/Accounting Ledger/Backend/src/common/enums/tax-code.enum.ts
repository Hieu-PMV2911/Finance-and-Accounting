/**
 * Loại thuế trên mã thuế (mục 10.C).
 *
 * Quyết định đã chốt: *"chỉ làm GTGT cơ bản"*, và thuế là **lớp tính trên dòng
 * chứng từ** — dòng thuế sinh tự động khi ghi sổ, **không** nhập tay vào bút toán.
 * Bảng `tax_codes` cấu hình được (không hardcode) vì luật thuế VN thay đổi theo thời gian.
 */
export enum TaxType {
  /** Thuế giá trị gia tăng (GTGT/VAT). */
  VAT = 'vat',
}

export const ALL_TAX_TYPES: readonly TaxType[] = Object.values(TaxType);

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  [TaxType.VAT]: 'Thuế GTGT',
};

/**
 * Tiền tố tài khoản thuế GTGT theo TT200.
 *
 * - Đầu ra (bán hàng, phải nộp): **3331**.
 * - Đầu vào (mua hàng, được khấu trừ): **1331**.
 *
 * Dùng làm **lưới an toàn** khi mã thuế chưa khai tài khoản đích (cùng triết lý
 * với `AccountDefaultsService`): mọi nhánh đều trả về tài khoản lá đang hoạt động.
 */
export const VAT_OUTPUT_ACCOUNT_PREFIX = '3331';
export const VAT_INPUT_ACCOUNT_PREFIX = '1331';
