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

## 6. Sổ cái & số dư (Ledger) — ✅ đã triển khai
- ✅ Bảng số dư `account_balances` (đầu kỳ / phát sinh / cuối kỳ), cập nhật trong cùng transaction khi ghi sổ.
- ✅ Số dư thuần (Nợ − Có) nên tài khoản bị đảo sẽ tự triệt tiêu về 0; `GET /api/fiscal-periods/:id/balances`.
- ✅ Truy vấn sổ cái chi tiết theo tài khoản — `GET /api/ledger/general-ledger` (theo `periodId` hoặc `fromDate`/`toDate`):
  số dư đầu kỳ → từng dòng phát sinh kèm **số dư lũy kế** → số dư cuối kỳ.
- ✅ Trial Balance (bảng cân đối số phát sinh) — `GET /api/ledger/trial-balance`: số dư đầu, phát sinh Nợ/Có,
  số dư cuối của **mọi** tài khoản + tổng cộng và cờ `balanced` (Tổng Nợ = Tổng Có).
- ✅ Đối chiếu số dư — `GET /api/ledger/reconciliation?periodId=...`: so `account_balances` đã lưu với số dư
  **tái lập từ `journal_lines`** (chỉ tính POSTED + REVERSED), trả về `consistent` + danh sách `differences`.
- ✅ Sổ cái và báo cáo đều đọc từ `journal_lines` nên chạy đúng cho **mọi khoảng ngày tùy ý**, không phụ thuộc bảng số dư.

## 7. Báo cáo tài chính — ✅ đã triển khai
- ✅ Kết quả kinh doanh (P&L) — `GET /api/reports/profit-and-loss`: doanh thu (Có−Nợ), chi phí (Nợ−Có),
  lợi nhuận thuần và biên lợi nhuận.
- ✅ Bảng cân đối kế toán — `GET /api/reports/balance-sheet`: Tài sản = Nợ phải trả + Vốn chủ sở hữu
  (+ lợi nhuận giữ lại), có cờ `balanced`; `toDate` là ngày lập báo cáo.
- ✅ Lưu chuyển tiền tệ — `GET /api/reports/cash-flow` (phương pháp trực tiếp): tiền đầu kỳ → 3 nhóm
  hoạt động (kinh doanh / đầu tư / tài chính) → tiền cuối kỳ.
- ✅ Xuất Excel/PDF — `GET /api/reports/export/:kind?format=xlsx|pdf` (`kind` = profit-and-loss |
  balance-sheet | cash-flow). Excel dùng `exceljs`; PDF dùng `pdfkit` **nhúng font Unicode** để hiển thị
  đúng dấu tiếng Việt.

## 8. Audit & bảo mật — ✅ đã triển khai
- ✅ Audit log mọi thao tác thay đổi (`GET /api/audit-logs`, chỉ `admin`): lưu **before/after** (ảnh chụp
  trường vô hướng), `actor` (id + email), hành động, bảng/khóa, thời điểm, `method`/`path`/`ip`/`userAgent`.
  Ghi bằng TypeORM **entity subscriber** trong **cùng transaction** với thao tác nghiệp vụ — rollback thì
  vết cũng biến mất; danh tính lấy từ `AsyncLocalStorage` do interceptor mở sau khi guard gắn `req.user`.
  Bảng loại trừ: `audit_logs`, `account_balances` (dẫn xuất), `refresh_tokens`; trường nhạy cảm bị lọc.
- ✅ Truy vết báo cáo → bút toán → chứng từ nguồn — `GET /api/audit-logs/traceability/journal-entries/:id`
  trả về bút toán, các dòng định khoản, số chứng từ gốc và vết kiểm toán của bút toán.
- ✅ Vết theo một bản ghi — `GET /api/audit-logs/trace/:entity/:entityId` (cũ → mới).

## 9. Xử lý bất đồng bộ (Queue + Schedule) — ✅ đã triển khai
- ✅ **Job định kỳ** (`@nestjs/schedule`, module `jobs`):
  - `balance-snapshot` — 01:00 hằng ngày: **chốt số dư** kỳ đang mở (tái lập từ
    `journal_lines`, đối chiếu `account_balances`, tính Σ phát sinh Nợ/Có).
    Mặc định **chỉ báo cáo**; ghi lại số dư phải truyền `repair = true`.
  - `integrity-check` — 02:30 hằng ngày: **kiểm tra 7 bất biến** (Σ Nợ = Σ Có,
    số dư tái lập được, kỳ đã khóa/chốt, dòng mồ côi, số tiền sai quy tắc, ghi
    vào tài khoản cha, số hiệu trùng). Có vi phạm ⇒ thông báo cho `admin` +
    webhook `integrity.violation`.
  - `debt-reminder` — 08:00 thứ Hai: **nhắc công nợ** theo số dư tài khoản
    131 (phải thu) và 331 (phải trả) **và** theo đối tượng + tuổi nợ từ hóa
    đơn/phiếu đã ghi sổ (mục 10.A) ⇒ sinh thông báo.
  - `overdue-invoice-sweep` — 09:00 hằng ngày (mục 10.A): quét hóa đơn bán **quá
    hạn** theo `dueDate` và số còn lại sau phân bổ ⇒ thông báo cho `poster`/`admin`
    + webhook `invoice.overdue`; không có gì quá hạn thì không gửi gì.
  - `webhook-retry-sweep` — mỗi 5 phút: đẩy lại webhook `pending` bị mất job.
  - `payment-status-poll` — mỗi 2 phút (mục 10.B): tra cứu lại provider cho giao dịch chưa có kết luận;
    captured ⇒ ghi sổ đúng một lần; quá ngưỡng `PAYMENT_INTENT_MAX_POLLS` ⇒ ngoại lệ + thông báo rồi dừng.
- ✅ **Job nền (BullMQ)** — 5 hàng đợi, mỗi hàng một processor:
  `reports` (sinh báo cáo nặng / xuất Excel-PDF), `maintenance` (chốt số dư,
  kiểm tra bất biến, quét webhook), `notifications` (ghi thông báo, nhắc công
  nợ), `webhooks` (giao webhook), `payments` (tra cứu trạng thái giao dịch — mục 10.B).
  Retry theo backoff cấu hình riêng từng hàng.
- ✅ **Lịch sử & thử lại**: mọi lượt chạy ghi vào `job_runs` (trạng thái, số lần
  thử, payload, kết quả, lỗi, thời lượng) — `jobId` của BullMQ chính là id dòng
  này, nên trạng thái **bền qua restart** và API `POST /jobs/runs/:id/retry`
  xếp lại từ payload đã lưu.
- ✅ **Thông báo trong hệ thống** (`notifications`): job nền ghi thông báo thay vì
  gửi email/SMS (không cần dịch vụ ngoài); phạm vi hiển thị theo người nhận và
  vai trò. ⏳ Gửi email/Zalo thật.
- ✅ **Webhook + retry + xử lý kết quả đến trễ**:
  - `webhook_endpoints` — đăng ký nơi nhận, ký **HMAC-SHA256**
    (`x-webhook-signature: sha256=<hex>`).
  - `webhook_deliveries` — mỗi sự kiện một dòng giao cho từng endpoint, chống
    giao trùng theo `<sự kiện>:<đối tượng>:<endpoint>`; ghi mã HTTP, body trả về,
    lỗi và thời điểm thử kế tiếp; `POST /webhooks/deliveries/:id/retry` để gửi lại.
  - `webhook_events` — webhook **nhận vào** (`POST /webhooks/inbound`): idempotent
    theo `id` sự kiện (trùng lặp trả 200 để bên gửi ngừng retry) và phát hiện
    **kết quả đến trễ** (sự kiện cũ hơn sự kiện đã xử lý của cùng đối tượng ⇒
    ghi nhận `late`, giữ vết nhưng **không** ghi đè nghiệp vụ).
- ✅ **API & UI**: `GET /jobs/overview|queues|schedules|runs`, `POST /jobs/reports`,
  `POST /jobs/integrity-checks`, `POST /jobs/balance-snapshot`,
  `POST /jobs/schedules/:name/trigger`, `POST /jobs/runs/:id/retry`,
  `GET /jobs/runs/:id/download`; `/notifications` và `/webhooks` (chỉ `admin`).
  FE: trang **Xử lý bất đồng bộ**, **Thông báo**, **Webhook**.
- ⏳ Còn lại: dead-letter queue riêng cho job thất bại vĩnh viễn, gửi email/SMS,
  Bull Board/UI giám sát chuyên sâu, và định kỳ dọn file báo cáo cũ.

## 10. Mở rộng (dài hạn) — ✅ 10.0, 10.A & 10.B P2.1 đã xong · ⏳ 10.B P2.2/P2.3 & 10.C (kế hoạch ở `../EXTENSION_PLAN.md`)

Biến lõi sổ cái (mục 1–9) thành quy trình chứng từ: **Mini ERP** + **Payment & Reconciliation**,
rồi lên **đa tiền tệ · đa công ty · thuế**. Bốn chiều thông tin còn thiếu phải bổ sung **trước**
khi làm tính năng (xem `EXTENSION_PLAN.md` mục 3): **đối tượng (party)**, **chứng từ nguồn có cấu
trúc (source_type/source_id)**, **phân bổ thanh toán (allocations)**, **tiền tệ & đơn vị**.

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| **10.0 — Nền chung** | `parties` (+ `summary`/`usage`) · `journal_lines.party_id` (sổ cái phụ `GET /ledger/sub-ledger`) · `journal_entries.source_type/source_id` + `UNIQUE(source_type, source_id)` · `allocations` · truy vết trả `source {type, id, code}` | ✅ xong |
| **10.A — Mini ERP** | Customer/Vendor, Sales Invoice, Vendor Bill, Phiếu thu/chi + phân bổ, **công nợ + tuổi nợ** (`receivables-aging`/`payables-aging`/`revenue-by-party`), luật mặc định tài khoản, `approve/post/void` + bút toán đảo, webhook `*.posted` + `invoice.overdue`; **FE** `/invoices`, `/bills`, `/payments` (phân bổ), `/receivables` | ✅ xong (xem `../MUC-10-TIEP-THEO.md`. FE đã bấm qua trên trình duyệt với API giả lập — `../verification/`; nghiệm thu với **backend thật** còn ⛔ vì chưa có PostgreSQL) |
| **10.B — Payment & Reconciliation** | **P2.1 ✅** vòng đời thanh toán (`initiated → authorized → captured → settled`, nhánh `unknown` cho timeout), idempotency, webhook `payment.*` + kết quả đến trễ (không ghi đè), `reconciliation_exceptions`, cron `payment-status-poll` + leo thang, provider simulator (chỉ dev). **P2.2/P2.3 ⏳** sao kê ngân hàng, khớp 3 tầng, dead-letter queue, FE | P2.1 ✅ · P2.2/P2.3 ⏳ |
| **10.C — Nâng cao** | Đa tiền tệ (bảng `exchange_rates` nhập tay + chênh lệch tỷ giá) → thuế GTGT (`tax_codes`) → **đa công ty** (migration riêng) | ⏳ kế hoạch |

**Nguyên tắc bất di bất dịch:** mọi chứng từ của mục 10 ghi sổ **qua `JournalsService`** trong cùng
transaction (không có bộ máy ghi sổ thứ hai); một chứng từ nguồn chỉ sinh **một** bút toán gốc; sửa
sai bằng chứng từ điều chỉnh; **timeout không đồng nghĩa thất bại**; sổ cái luôn ở đồng tiền hạch toán.

**Nghiệm thu mục 10:** truy ngược **báo cáo → chứng từ nguồn → bút toán → vết kiểm toán** chạy một
mạch qua API, và kịch bản timeout/retry/kết quả đến trễ chạy end-to-end **mà không tạo giao dịch trùng**.

---
*Ghi chú: tiền lưu bằng `NUMERIC(19,4)` + `decimal.js` — tuyệt đối không dùng float.*
