# Backend — Chức năng phát triển trong tương lai

> Danh sách ngắn gọn các module/chức năng sẽ xây dựng cho Accounting Ledger API.
> Chi tiết lộ trình đầy đủ xem `../DEVELOPMENT_PLAN.md`.

## Đã có (nền tảng)
- NestJS 12 (ESM) + Swagger `/api/docs`, `ValidationPipe`, CORS, global prefix `/api`.
- Kết nối PostgreSQL (TypeORM), Redis/BullMQ (queue), `@nestjs/schedule` (cron).

## 1. Auth & phân quyền — ✅ đã triển khai
- Đăng nhập JWT + refresh token (có rotation & thu hồi), đổi mật khẩu. ⏳ quên/khôi phục mật khẩu (qua email).
- RBAC theo vai trò kế toán: `maker` (lập) / `checker` (duyệt) / `poster` (ghi sổ) / `admin`.
- Guard chặn thao tác theo trạng thái chứng từ và vai trò.
  ✅ Guard theo trạng thái chứng từ đã làm cùng module Journals (bút toán đã ghi sổ là bất biến).

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

## 4. Kỳ kế toán (Fiscal Period) — ✅ đã triển khai
- ✅ Tạo/mở/khóa/chốt kỳ kế toán (`/api/fiscal-periods`, vòng đời `open → locked → closed`).
- ✅ Chặn **mọi** bút toán vào kỳ đã khóa/chốt — kể cả bút toán nháp (bất biến số 3).
- ✅ Ràng buộc: mã kỳ duy nhất, `startDate ≤ endDate`, ngày phải tồn tại thật, **không chồng lấn** kỳ khác.
- ✅ Khi **chốt kỳ**: tự động kết chuyển số dư cuối kỳ thành số dư đầu kỳ của kỳ kế tiếp.
  Kỳ đã chốt **không thể mở lại**; kỳ tạm khóa thì mở lại được.
- ⏳ Khóa kỳ theo từng module (AR/AP/GL riêng) và theo người dùng.

## 5. Bút toán (Journal Entry) — ✅ đã triển khai
- ✅ Tạo nháp → xác nhận → ghi sổ (trong 1 transaction), vòng đời `draft → approved → posted → reversed`.
- ✅ Kiểm tra cân bằng Nợ = Có ở backend (không tin frontend); tối thiểu 2 dòng, mỗi dòng chỉ 1 bên, số tiền > 0.
- ✅ RBAC theo vòng đời: `maker` lập · `checker` duyệt · `poster` ghi sổ/đảo.
- ✅ Đảo bút toán bằng chứng từ điều chỉnh, **không xóa lịch sử đã ghi sổ**; bút toán gốc chuyển `reversed`.
- ✅ Idempotency key chống ghi trùng; khóa bi quan chống mất cập nhật số dư.
- ✅ Cấp số hiệu `JE-<mã kỳ>-<0001>` bằng `pg_advisory_xact_lock` (không trùng khi ghi đồng thời).
- ⏳ Bút toán định kỳ (recurring) và bút toán mẫu.

## 6. Sổ cái & số dư (Ledger) — 🟡 một phần
- ✅ Bảng số dư `account_balances` (đầu kỳ / phát sinh / cuối kỳ), cập nhật trong cùng transaction khi ghi sổ.
- ✅ Số dư thuần (Nợ − Có) nên tài khoản bị đảo sẽ tự triệt tiêu về 0; `GET /api/fiscal-periods/:id/balances`.
- ⏳ Truy vấn sổ cái chi tiết theo tài khoản / kỳ / đối tượng.
- ⏳ Trial Balance (bảng cân đối số phát sinh) và tái lập số dư từ journal lines để đối chiếu.

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
