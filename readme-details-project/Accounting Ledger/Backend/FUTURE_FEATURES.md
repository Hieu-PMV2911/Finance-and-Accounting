# Backend — Chức năng phát triển trong tương lai

> Danh sách ngắn gọn các module/chức năng sẽ xây dựng cho Accounting Ledger API.
> Chi tiết lộ trình đầy đủ xem `../DEVELOPMENT_PLAN.md`.

## Đã có (nền tảng)
- NestJS 12 (ESM) + Swagger `/api/docs`, `ValidationPipe`, CORS, global prefix `/api`.
- Kết nối PostgreSQL (TypeORM), Redis/BullMQ (queue), `@nestjs/schedule` (cron).

## 1. Auth & phân quyền — ✅ đã triển khai
- Đăng nhập JWT + refresh token (có rotation & thu hồi), đổi mật khẩu. ⏳ quên/khôi phục mật khẩu (qua email).
- RBAC theo vai trò kế toán: `maker` (lập) / `checker` (duyệt) / `poster` (ghi sổ) / `admin`.
- Guard chặn thao tác theo trạng thái chứng từ và vai trò. ⏳ guard theo trạng thái chứng từ (làm cùng module Journals).

## 2. Người dùng — ✅ đã triển khai
- ✅ CRUD người dùng (admin), gán vai trò, khóa/mở tài khoản.
- ✅ Đặt lại mật khẩu cho người dùng (admin) — thu hồi mọi phiên đăng nhập.
- ✅ Hồ sơ cá nhân: xem/cập nhật họ tên + ảnh đại diện (`/api/profile`).
- ⏳ Tải ảnh đại diện lên (lưu file/storage) — hiện chỉ lưu URL ảnh.

## 3. Tài khoản kế toán (Chart of Accounts) — ✅ đã triển khai
- ✅ CRUD tài khoản, cây tài khoản phân cấp (parent/child) — `GET /api/accounts/tree`.
- ✅ 5 loại: Tài sản / Nợ phải trả / Vốn chủ sở hữu / Doanh thu / Chi phí.
- ✅ Chỉ cho ghi sổ vào tài khoản lá (`isPostable`); tài khoản có con tự động bị tắt ghi sổ.
- ✅ Bất biến: mã duy nhất, con cùng loại cha, chống chu trình, không xóa khi còn con.
- ⏳ Seed hệ thống tài khoản chuẩn TT200/TT133 (làm ở Giai đoạn 1).

## 4. Kỳ kế toán (Fiscal Period)
- Tạo/mở/khóa kỳ kế toán.
- Chặn mọi bút toán vào kỳ đã khóa; chốt số dư đầu kỳ cho kỳ sau.

## 5. Bút toán (Journal Entry)
- Tạo nháp → xác nhận → ghi sổ (trong 1 transaction).
- Kiểm tra cân bằng Nợ = Có ở backend (không tin frontend).
- Đảo bút toán bằng chứng từ điều chỉnh, **không xóa lịch sử đã ghi sổ**.
- Idempotency key chống ghi trùng; khóa đồng thời khi cập nhật số dư.

## 6. Sổ cái & số dư (Ledger)
- Truy vấn sổ cái theo tài khoản / kỳ / đối tượng.
- Số dư tài khoản, Trial Balance (bảng cân đối thử).
- Tái lập số dư từ journal lines để đối chiếu.

## 7. Báo cáo tài chính
- Kết quả kinh doanh (P&L).
- Bảng cân đối kế toán.
- Lưu chuyển tiền tệ.
- Xuất Excel/PDF.

## 8. Audit & bảo mật
- Audit log mọi thao tác thay đổi (before/after, actor, thời điểm).
- Truy vết từ báo cáo → bút toán → chứng từ nguồn.

## 9. Xử lý bất đồng bộ (Queue + Schedule)
- Job định kỳ: chốt số dư, kiểm tra bất biến, nhắc công nợ.
- Job nền: sinh báo cáo nặng, gửi thông báo, retry khi lỗi.
- Webhook + retry + xử lý kết quả đến trễ (nền tảng cho Payment & Reconciliation).

## 10. Mở rộng (dài hạn)
- **Mini ERP:** Customer/Vendor, Sales Invoice, Vendor Bill, công nợ, thanh toán một phần.
- **Payment & Reconciliation:** vòng đời thanh toán, đối soát sao kê ngân hàng, danh sách giao dịch lệch.
- Đa tiền tệ, đa công ty, tích hợp thuế.

---
*Ghi chú: tiền lưu bằng `NUMERIC(19,4)` + `decimal.js` — tuyệt đối không dùng float.*
