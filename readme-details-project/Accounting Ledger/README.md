# Accounting Ledger

> Phần mềm **kế toán ghi sổ kép** (double-entry accounting ledger) chạy trên web,
> dùng để ghi nhận, kiểm soát và báo cáo toàn bộ nghiệp vụ tài chính của một doanh nghiệp.
> Ứng dụng gồm **Frontend** (SPA cho kế toán viên/quản trị dùng hằng ngày) và **Backend**
> (API + nghiệp vụ + hàng đợi xử lý nền).

---

## 1. Web này là gì, dùng để làm gì?

**Accounting Ledger** là hệ thống sổ cái kế toán trên nền web. Mục đích chính:

- **Ghi sổ kế toán kép**: mọi nghiệp vụ kinh tế được ghi thành *bút toán* (journal entry) gồm nhiều
  dòng định khoản, đảm bảo **tổng Nợ = tổng Có**.
- **Quản lý vòng đời chứng từ**: nháp → xác nhận → ghi sổ → đảo. Bút toán đã ghi sổ **không sửa/xóa**,
  sai thì tạo **bút toán đảo** để giữ nguyên lịch sử (append-only).
- **Quản lý kỳ kế toán**: mở / tạm khóa / chốt kỳ; chốt kỳ sẽ kết chuyển số dư cuối kỳ thành số dư
  đầu kỳ của kỳ kế tiếp.
- **Sổ cái & số dư**: sổ cái chi tiết, sổ cái phụ theo đối tượng, bảng cân đối số phát sinh
  (trial balance), đối chiếu tái lập số dư.
- **Báo cáo tài chính**: Kết quả kinh doanh, Bảng cân đối kế toán, Lưu chuyển tiền tệ — xem trên web
  và xuất Excel/PDF.
- **Mini ERP**: quản lý khách hàng/nhà cung cấp, hóa đơn bán/mua, phiếu thu/chi, phân bổ thanh toán,
  tuổi nợ phải thu/phải trả.
- **Vận hành & kiểm soát**: hàng đợi xử lý nền + lịch chạy định kỳ, thông báo trong hệ thống,
  webhook vào/ra, và **nhật ký kiểm toán** ghi vết mọi thay đổi dữ liệu.

**Ai dùng?** Hệ thống phân quyền theo 4 vai trò, có thể gán nhiều vai trò cho một người:

| Vai trò   | Ý nghĩa | Được làm gì |
| --------- | ------- | ----------- |
| `admin`   | Quản trị | Toàn quyền: quản lý người dùng, danh mục, cấu hình, webhook, kiểm toán |
| `maker`   | Người lập | Tạo/sửa **nháp** bút toán và chứng từ |
| `checker` | Người duyệt | Xác nhận (approve) nháp → đã xác nhận |
| `poster`  | Người ghi sổ | Ghi sổ (post), đảo bút toán, chốt kỳ, chạy tác vụ vận hành |

---

## 2. Cấu trúc source

```
Accounting Ledger/
├── README.md                 ← file này
├── package.json              ← script uỷ quyền: dev / dev:fe / dev:be / build / lint / test / seed
├── docker-compose.yml        ← postgres:16 + redis:7 (chỉ dùng khi muốn chạy bằng Docker)
├── DEVELOPMENT_PLAN.md       ← roadmap, ERD, bất biến nghiệp vụ
├── EXTENSION_PLAN.md         ← kế hoạch mở rộng (Mini ERP, Payment & Reconciliation, đa tiền tệ)
├── MUC-10-TIEP-THEO.md       ← trạng thái chi tiết từng hạng mục mục 10 (P0/P1)
│
├── Frontend/                 ← SPA: Vite 8 + React 19 + TypeScript + Tailwind v4 + shadcn/ui
│   └── src/
│       ├── App.tsx           ← khai báo route (mỗi trang lazy-load)
│       ├── index.css         ← design token (Tailwind v4, OKLCH, sáng/tối)
│       ├── components/       ← Layout, ProtectedRoute, PageHeader, DataStates, ScopePicker + ui/ (shadcn)
│       ├── lib/              ← api.ts (axios + tự refresh token), format, money, scope, queryClient, utils
│       ├── stores/           ← auth.store.ts (zustand + persist, key `al-auth`)
│       ├── types/            ← kiểu dữ liệu & nhãn dùng chung
│       └── features/         ← mỗi màn hình một thư mục (xem mục 4)
│
└── Backend/                  ← NestJS 12 (ESM) + TypeORM + PostgreSQL + BullMQ/Redis
    └── src/
        ├── common/           ← decorators, guards, enums, utils (money, date), services
        ├── auth/             ← đăng nhập, refresh token, đổi mật khẩu, JWT
        ├── users/            ← người dùng (admin) + hồ sơ cá nhân
        ├── accounts/         ← hệ thống tài khoản kế toán (Chart of Accounts)
        ├── fiscal-periods/   ← kỳ kế toán (mở/khóa/chốt)
        ├── journals/         ← bút toán & dòng định khoản
        ├── ledger/           ← số dư, sổ cái, trial balance, đối chiếu, sổ cái phụ
        ├── reports/          ← báo cáo tài chính + xuất Excel/PDF + tuổi nợ
        ├── audit/            ← nhật ký kiểm toán (ghi vết tự động)
        ├── parties/          ← khách hàng / nhà cung cấp (mục 10.0)
        ├── account-defaults/ ← luật mặc định tài khoản cho dòng hóa đơn (mục 10.A)
        ├── invoices/         ← hóa đơn bán (sales invoices)
        ├── bills/            ← hóa đơn mua (vendor bills)
        ├── payments/         ← phiếu thu/chi + phân bổ thanh toán
        ├── allocations/      ← lớp phân bổ công nợ dùng chung
        ├── payment-intents/  ← yêu cầu thanh toán + provider mô phỏng (mục 10.B)
        ├── reconciliation/   ← sao kê ngân hàng, khớp đối soát, danh sách lệch (mục 10.B)
        ├── companies/        ← công ty + đơn vị tiền hạch toán (mục 10.C.1)
        ├── currencies/       ← danh mục tiền, tỷ giá, chênh lệch tỷ giá (mục 10.C.1)
        ├── taxes/            ← mã thuế GTGT + dòng thuế tự sinh khi ghi sổ (mục 10.C.2)
        ├── jobs/             ← hàng đợi, lịch định kỳ, thông báo, webhook (mục 9)
        ├── main.ts           ← prefix /api, CORS, validation, Swagger tại /api/docs
        └── seed.ts           ← tạo admin + công ty/tiền tệ/luật mặc định/mã thuế đầu tiên
```

---

## 3. Công nghệ sử dụng

| Lớp | Công nghệ |
| --- | --- |
| Frontend | Vite 8, React 19, TypeScript, react-router-dom, axios, TanStack Query, zustand, zod, dayjs, recharts |
| Giao diện | Tailwind CSS v4 (cấu hình CSS-first) + shadcn/ui trên Radix UI, lucide-react, sonner |
| Backend | NestJS 12 (ESM), TypeORM + PostgreSQL, @nestjs/schedule (cron), @nestjs/bullmq + Redis, Swagger, Passport + JWT |
| Bảo mật | bcryptjs (băm mật khẩu), SHA-256 cho refresh token, JWT có rotation |
| Số học tiền | `decimal.js` + cột DB `NUMERIC(19,4)` — **không bao giờ dùng số thực cho tiền** |
| Quản lý gói | pnpm · Test: Vitest · Lint: oxlint |

---

## 4. Chi tiết các mục / màn hình chức năng

Dưới đây là toàn bộ các mục đã có trong source, kèm chức năng con của từng mục.

### 4.1. Đăng nhập — `/login`
- Đăng nhập bằng email + mật khẩu; nhận access token + refresh token.
- Phiên đăng nhập lưu ở client (zustand persist); tự động refresh khi token hết hạn.
- Thông báo lỗi **giống nhau** dù sai email hay mật khẩu (chống dò tài khoản).

### 4.2. Tổng quan — `/` (Tổng quan)
Màn hình chào, cho cái nhìn nhanh về tình hình hệ thống:
- **4 thẻ số liệu**: Tổng tài khoản · Đang hoạt động · Tài khoản lá (ghi sổ) · Tài khoản tổng hợp.
- **Biểu đồ thanh** "Phân bổ theo loại tài khoản" (Tài sản, Nợ phải trả, Vốn, Doanh thu, Chi phí).
- **Danh sách kỳ kế toán đang mở** (dạng badge) + lối tắt sang Quản lý kỳ.
- Nút lối tắt: Sổ bút toán, Quản lý tài khoản.

### 4.3. Bút toán — `/journals`
Nơi ghi nhận nghiệp vụ kinh tế. Vòng đời: `nháp → đã xác nhận → đã ghi sổ → đã đảo`.
- **Bảng danh sách bút toán**: số hiệu, ngày, diễn giải, số tiền, trạng thái; lọc theo
  từ khoá / trạng thái / kỳ kế toán / khoảng ngày.
- **Lập bút toán** (nháp): chọn ngày hạch toán, diễn giải, số chứng từ gốc, và nhiều **dòng định
  khoản** (tài khoản + diễn giải dòng + Nợ/Có); kiểm tra cân bằng ngay trên form.
  Có **khoá chống ghi trùng** (idempotency) cho mỗi lần tạo.
- **Sửa nháp**: chỉ sửa được bút toán còn ở trạng thái nháp và kỳ đang mở.
- **Xác nhận** (checker): nháp → đã xác nhận.
- **Ghi sổ** (poster): cấp số hiệu, cập nhật số dư, phát webhook; chống ghi trùng.
- **Đảo bút toán** (poster): nhập lý do + ngày hạch toán, hệ thống hoán đổi Nợ/Có của các dòng
  và tạo bút toán đảo, bút toán gốc chuyển sang trạng thái "đã đảo".
- **Xoá nháp**: chỉ xoá được bút toán nháp (có hộp thoại xác nhận).
- **Xem chi tiết**: thông tin bút toán + bảng dòng định khoản + tổng cộng; thao tác nhanh ngay
  trong cửa sổ chi tiết.

### 4.4. Kỳ kế toán — `/periods`
Quản lý các kỳ (tháng/quý/năm). Vòng đời: `đang mở → tạm khóa → đã chốt`.
- **Bảng kỳ**: mã kỳ, tên kỳ, khoảng thời gian, trạng thái; lọc theo từ khoá / trạng thái / năm.
- **Tạo kỳ**: mã duy nhất, không chồng lấn thời gian với kỳ khác.
- **Sửa kỳ**: chỉ khi kỳ đang mở.
- **Mở lại kỳ**: kỳ tạm khóa có thể mở lại.
- **Chốt kỳ**: đóng băng vĩnh viễn + **kết chuyển số dư** sang kỳ kế tiếp (có hộp thoại xác nhận).
- **Xoá kỳ**: chỉ khi kỳ đang mở và chưa có bút toán nào.
- **Xem số dư kỳ**: bảng dư đầu kỳ / phát sinh / dư cuối kỳ theo từng tài khoản (Nợ – Có).
- Khi kỳ **tạm khóa hoặc đã chốt**: chặn tạo nháp, sửa, xoá, ghi sổ, đảo.

### 4.5. Sổ cái — `/ledger` (4 tab)
- **Sổ cái chi tiết**: chọn tài khoản + phạm vi (theo kỳ hoặc khoảng ngày) → hiện dư đầu kỳ,
  từng dòng phát sinh (ngày, số hiệu, diễn giải, chứng từ, PS Nợ, PS Có, dư luỹ kế), rồi dư cuối kỳ.
- **Sổ cái phụ**: chọn **đối tượng** (khách/NCC) + tài khoản công nợ (131/331…) → theo dõi công nợ
  của riêng đối tượng đó; có nút **truy vết bút toán**.
- **Bảng cân đối số phát sinh (Trial Balance)**: mọi tài khoản với dư đầu Nợ/Có, PS Nợ/Có,
  dư cuối Nợ/Có, dòng tổng cộng và cờ cho biết bảng có **cân bằng** hay không.
- **Đối chiếu số dư**: so số dư **đã lưu** với số dư **tái lập từ bút toán** theo từng tài khoản,
  chỉ ra `nhất quán` và danh sách các trường bị lệch.

### 4.6. Báo cáo tài chính — `/reports` (3 tab)
Chọn phạm vi báo cáo (theo kỳ kế toán **hoặc** khoảng ngày tuỳ chọn) rồi xem / xuất file.
- **Kết quả kinh doanh (P&L)**: doanh thu, chi phí, lợi nhuận thuần, biên lợi nhuận.
- **Bảng cân đối kế toán**: Tài sản = Nợ phải trả + Vốn chủ sở hữu + Lợi nhuận giữ lại, có cờ cân bằng.
- **Lưu chuyển tiền tệ**: phương pháp trực tiếp, chia 3 nhóm Hoạt động kinh doanh / đầu tư / tài chính.
- **Xuất báo cáo**: tải về **Excel (.xlsx)** hoặc **PDF** cho từng loại báo cáo.
- (Backend còn có báo cáo **tuổi nợ phải thu / phải trả** và **doanh thu theo đối tượng** — hiển thị
  qua API và dữ liệu công nợ của Mini ERP.)

### 4.7. Tài khoản kế toán — `/accounts` (2 chế độ xem)
Hệ thống tài khoản (Chart of Accounts) dạng **cây phân cấp**.
- **Chế độ Cây**: xem tài khoản theo cấp cha–con, có nhãn loại (Tài sản/Nợ phải trả/Vốn/Doanh thu/Chi phí),
  nhãn "ghi sổ" (tài khoản lá) hay "tổng hợp" (tài khoản cha), trạng thái hoạt động/ngừng.
- **Chế độ Bảng**: danh sách phẳng có phân trang, lọc theo từ khoá / loại / trạng thái.
- **Thêm / Sửa tài khoản**: mã, tên, loại, tài khoản cha, cờ ghi sổ, trạng thái.
- **Xoá tài khoản**: chỉ xoá được tài khoản lá.
- Quy tắc: **chỉ ghi sổ vào tài khoản lá** (`is_postable`), không ghi vào tài khoản cha.

### 4.8. Đối tượng (Khách hàng / Nhà cung cấp) — `/parties`
Danh mục đối tượng dùng cho công nợ và hóa đơn (mục 10.0).
- **Bảng đối tượng**: mã, tên, loại (khách/NCC/cả hai), điện thoại, mã số thuế, trạng thái;
  lọc theo từ khoá / loại / trạng thái.
- **Thêm / Sửa đối tượng**: mã duy nhất + thông tin liên hệ.
- **Xoá đối tượng**: nếu đã phát sinh bút toán thì **không xoá được** (báo lỗi) — phải chuyển sang
  "ngừng sử dụng"; nếu chưa dùng thì xoá được.
- **Xem công nợ đối tượng**: tổng hợp công nợ theo từng tài khoản (131/331…).

### 4.9. Xử lý bất đồng bộ — `/jobs` (3 tab)
Màn hình vận hành các tác vụ chạy nền (hàng đợi BullMQ + cron).
- **Tab Hàng đợi & lượt chạy**:
  - 4 thẻ số liệu: đang chờ / đang chạy / hoàn thành / thất bại.
  - 4 hàng đợi (báo cáo, bảo trì, thông báo, webhook) với số job chờ/chạy/xong/lỗi/hoãn.
  - Bảng **lịch sử lượt chạy** (thời điểm, hàng đợi, công việc, trạng thái), lọc theo hàng đợi / trạng thái.
  - **Chi tiết lượt chạy**: payload, kết quả, lỗi, thời lượng; **thử lại** job đã thất bại;
    **tải file báo cáo** do job sinh ra.
  - **Xếp job mới**: sinh báo cáo nền (loại + định dạng + phạm vi) và chốt/đối chiếu số dư kỳ.
- **Tab Lịch định kỳ**: danh sách 5 lịch cron kèm lần chạy gần nhất / kế tiếp và kết quả gần nhất;
  có nút **chạy ngay** một lịch:
  1. `Chốt số dư cuối ngày` (01:00)
  2. `Kiểm tra bất biến` (02:30)
  3. `Nhắc công nợ` (08:00 thứ Hai — số dư 131/331 + tuổi nợ theo đối tượng)
  4. `Quét hóa đơn quá hạn` (09:00 hằng ngày — thông báo + webhook)
  5. `Quét webhook treo` (mỗi 5 phút — gửi lại webhook thất bại)
- **Tab Kiểm tra bất biến**: chạy 7 kiểm tra toàn vẹn dữ liệu kế toán, hiển thị số vi phạm,
  số bút toán đã kiểm, số lượt kiểm tra và kết luận.

### 4.10. Thông báo — `/notifications`
Hộp thư thông báo trong hệ thống (đầu ra của các job nền).
- Danh sách thông báo: tiêu đề, nội dung, loại, mức độ (info / warning / critical), trạng thái đọc.
- Lọc theo từ khoá / trạng thái (chưa đọc – đã đọc) / mức độ.
- **Đánh dấu đã đọc** một thông báo hoặc **đọc tất cả**; có số lượng chưa đọc (badge).
- Phạm vi người nhận: mọi người · chỉ quản trị · người ghi sổ + quản trị · một người cụ thể.
- Ví dụ loại thông báo: nhắc công nợ, cảnh báo hóa đơn quá hạn.

### 4.11. Webhook — `/webhooks` (chỉ admin, 3 tab)
Tích hợp với hệ thống bên ngoài.
- **Tab Endpoint**: danh sách endpoint đã đăng ký (URL, sự kiện quan tâm, bật/tắt, trạng thái);
  thêm / sửa / xoá endpoint; khoá ký (secret) không bao giờ hiển thị lại.
  Thống kê nhanh: endpoint hoạt động, đang chờ giao, giao thất bại, sự kiện nhận vào.
- **Tab Nhật ký giao**: các lần gửi webhook ra ngoài (đang chờ / đã giao / thất bại),
  lọc theo trạng thái; **thử lại** một lần giao thất bại.
- **Tab Sự kiện nhận vào**: webhook từ hệ thống ngoài gửi tới, kèm kết quả
  (đã xử lý / trùng lặp / đến trễ / bị từ chối); có phát một sự kiện ra endpoint để kiểm thử.
- Chữ ký HMAC-SHA256 bảo vệ webhook vào; xử lý trùng lặp theo id sự kiện.

### 4.12. Kiểm toán — `/audit` (chỉ admin, 2 tab)
- **Tab Nhật ký thay đổi**: mọi thay đổi dữ liệu được ghi vết tự động (thời điểm, hành động,
  bảng dữ liệu, người thực hiện); lọc theo từ khoá / bảng dữ liệu / hành động / khoảng ngày / số dòng;
  xem **chi tiết** một vết (giá trị trước → sau).
- **Tab Truy vết bút toán**: chọn một bút toán → xem **chuỗi truy vết** từ bút toán → các dòng định
  khoản → chứng từ nguồn (hóa đơn / phiếu thu, chi…) kèm lịch sử thay đổi.

### 4.13. Người dùng — `/users` (chỉ admin)
- **Bảng người dùng**: email, họ tên, vai trò, trạng thái, lần đăng nhập cuối.
- **Tạo người dùng**: email, mật khẩu (tối thiểu 8 ký tự), họ tên, vai trò.
- **Sửa người dùng**: hồ sơ, vai trò, trạng thái hoạt động/khóa.
- **Đặt lại mật khẩu**: cấp mật khẩu mới và **thu hồi mọi phiên đăng nhập** của người đó.

### 4.14. Hồ sơ của tôi — `/profile`
- **Thông tin tài khoản**: email, vai trò, trạng thái, lần đăng nhập cuối, ngày tạo.
- **Cập nhật hồ sơ**: họ tên, ảnh đại diện.
- **Đổi mật khẩu**: đổi xong **thu hồi toàn bộ refresh token** (buộc đăng nhập lại các phiên khác).
- **Đăng xuất** (cũng có ở menu tài khoản trên sidebar).

### 4.15. Mini ERP — chứng từ & công nợ (dữ liệu + API đã có)
Nằm trong cùng hệ thống, ghi sổ **qua chính bộ máy bút toán** (không có bộ máy thứ hai):
- **Hóa đơn bán** (sales invoices) và **hóa đơn mua** (vendor bills): vòng đời
  `nháp → đã xác nhận → đã ghi sổ → đã huỷ`; ghi sổ sẽ **sinh bút toán** và phát webhook;
  huỷ hóa đơn đã ghi sổ sẽ **sinh bút toán đảo**.
- **Phiếu thu / phiếu chi** (payments): ghi sổ sinh bút toán (thu: Nợ 111/112 · Có 131;
  chi: Nợ 331 · Có 111/112); có khoá chống ghi trùng.
- **Phân bổ thanh toán** (allocations): gắn số tiền của phiếu thu/chi vào từng hóa đơn, chặn phân bổ
  vượt trần hai bên — là lớp **phân tích công nợ**, không sinh bút toán mới.
- **Luật mặc định tài khoản** (account defaults): quy tắc chọn tài khoản cho dòng hóa đơn theo
  phạm vi + nhóm nghiệp vụ, dùng khi dòng hóa đơn không chỉ định tài khoản.
- **Báo cáo tuổi nợ**: tuổi nợ phải thu / phải trả theo hạn thanh toán (≤30 / 31–60 / 61–90 / >90
  ngày + chưa đến hạn + không có hạn).

### 4.16. Thanh toán & đối soát — mục 10.B (dữ liệu + API đã có)
- **Yêu cầu thanh toán** (payment intents): vòng đời `khởi tạo → uỷ quyền → đã thu → đã tất toán`,
  có nhánh thất bại / hoàn tiền / hết hạn. Điểm cốt lõi: **timeout không đồng nghĩa thất bại** —
  khi nhà cung cấp không trả lời, ý định chuyển sang trạng thái "chưa xác định / chờ kiểm tra" và
  hệ thống **tra cứu lại** (thủ công hoặc qua job nền) thay vì kết luận là hỏng.
- **Chống thu trùng**: mỗi ý định thanh toán mang một khoá chống trùng; tra cứu lại dùng **đúng**
  khoá đó nên hồi phục được mà **không sinh bút toán thứ hai**.
- **Sao kê ngân hàng** (bank statements): nạp sao kê từ **file CSV/JSON** hoặc **kết nối API** —
  cả hai đi vào **cùng một mô hình giao dịch chuẩn** rồi cùng chạy một quy trình khớp.
- **Đối soát**: tự động khớp dòng sao kê với chứng từ nội bộ (theo mã tham chiếu + số tiền, theo
  số tiền + ngày, và gợi ý mờ theo diễn giải); xác nhận / gỡ dòng khớp (cho phép khớp nhiều-nhiều
  và khớp một phần).
- **Danh sách lệch** (reconciliation exceptions): thiếu ở sổ nội bộ, thiếu ở sao kê, lệch số tiền,
  thanh toán trùng, xung đột kết quả đến trễ; xử lý **bắt buộc kèm lý do** và **không xoá** (đó là bằng chứng).

### 4.17. Nâng cao — mục 10.C (dữ liệu + API đã có)
- **Đa tiền tệ** (10.C.1): **đơn vị tiền hạch toán cấu hình được** theo công ty (mặc định VND);
  danh mục tiền tệ; **bảng tỷ giá nhập tay** theo ngày (tra "tỷ giá mới nhất không muộn hơn ngày",
  **không nội suy** — tỷ giá nội suy không phải số đã công bố).
- **Bút toán ngoại tệ**: `Nợ`/`Có` **luôn** là tiền hạch toán, ngoại tệ lưu kèm trên cùng dòng —
  nhờ vậy Σ Nợ = Σ Có không đổi và mọi báo cáo hiện có không phải sửa. Tất toán ở tỷ giá khác
  **sinh bút toán chênh lệch tỷ giá** (lãi ⇒ Có 515 · lỗ ⇒ Nợ 635; đánh giá lại cuối kỳ dùng 413).
- **Thuế GTGT** (10.C.2): danh mục **mã thuế** cấu hình được (không hardcode — luật thuế thay đổi
  theo thời gian); thuế là **lớp tính trên từng dòng chứng từ**, thuế suất được **sao lại** vào dòng
  nên sửa danh mục **không** làm đổi chứng từ đã lập.
- **Dòng thuế sinh tự động khi ghi sổ** (không nhập tay vào bút toán): hóa đơn bán ⇒ **Có 3331**;
  hóa đơn mua ⇒ **Nợ 1331** (được khấu trừ). Tổng thuế của chứng từ = tổng thuế các dòng đã làm tròn.
- **Bảng kê thuế GTGT đầu vào / đầu ra theo kỳ** + **xuất Excel/PDF**, giữ từng hóa đơn (số, ngày,
  mã số thuế đối tượng) để tra ngược chứng từ giấy; số thuế phải nộp = đầu ra − đầu vào.

> ⚠️ Phần **giao diện** cho 10.B và 10.C (màn hình thanh toán, đối soát, công ty, tiền tệ, thuế)
> và **đa công ty** (cách ly dữ liệu theo `company_id` — 10.C.3) còn ở mức kế hoạch — xem
> `EXTENSION_PLAN.md` và `MUC-10-TIEP-THEO.md`.

---

## 5. Bất biến nghiệp vụ kế toán (luật không được vi phạm)

1. **Cân bằng kép**: mỗi bút toán Σ Nợ = Σ Có — kiểm tra ở backend, không tin frontend.
2. **Append-only**: bút toán đã ghi sổ không sửa/xoá; sai thì tạo bút toán đảo.
3. **Khóa kỳ**: kỳ `tạm khóa` và `đã chốt` đóng băng toàn bộ thao tác; `đã chốt` không mở lại được.
4. **Chỉ ghi vào tài khoản lá**, không ghi vào tài khoản cha.
5. **Tiền dùng `NUMERIC(19,4)` + `decimal.js`** — tuyệt đối không dùng số thực cho tiền.
6. **Idempotency + khóa đồng thời** khi ghi sổ / cập nhật số dư để chống ghi trùng.
7. **Ghi sổ nguyên tử** trong một transaction.
8. **Audit**: mọi thay đổi đều có vết (trước/sau, người thực hiện, thời điểm).
9. **Số dư là số dư thuần**: (Nợ đầu − Có đầu) + (Nợ phát sinh − Có phát sinh); tài khoản bị đảo
   phải triệt tiêu về 0, số dư âm trình bày ở cột "dư Có".

---

## 6. Chạy dự án

**Yêu cầu**: Node 22+, pnpm, PostgreSQL (và Redis nếu dùng tính năng hàng đợi/webhook).

```bash
# Cài phụ thuộc cho cả Frontend + Backend
pnpm install:all

# Tạo tài khoản admin đầu tiên (đọc ADMIN_EMAIL / ADMIN_PASSWORD trong Backend/.env)
pnpm seed

# Chạy song song: Frontend (Vite, cổng 5173) + Backend (NestJS, cổng 3000)
pnpm dev:fe
pnpm dev:be

# Hoặc chỉ chạy Frontend
pnpm dev
```

Sau khi chạy:
- Giao diện web: `http://localhost:5173`
- API: `http://localhost:3000/api` · Tài liệu Swagger: `http://localhost:3000/api/docs`

Các lệnh khác: `pnpm build` (build cả hai) · `pnpm lint` · `pnpm test` (test backend).
Nếu dùng Docker cho hạ tầng: `docker compose up -d`.

---

## 7. Trạng thái hiện tại

| Hạng mục | Trạng thái |
| -------- | ---------- |
| Tài khoản kế toán, kỳ kế toán, bút toán, số dư | ✅ Đã xong |
| Vòng đời bút toán + bút toán đảo + chống ghi trùng | ✅ Đã xong |
| Sổ cái, trial balance, đối chiếu số dư | ✅ Đã xong |
| Báo cáo tài chính + xuất Excel/PDF | ✅ Đã xong |
| Nhật ký kiểm toán + truy vết chứng từ | ✅ Đã xong |
| Hàng đợi, lịch định kỳ, thông báo, webhook (mục 9) | ✅ Đã xong |
| Mini ERP: đối tượng, hóa đơn bán/mua, phiếu thu/chi, phân bổ, tuổi nợ | ✅ Đã xong (mục 10.A) |
| Thanh toán (payment intents) + sao kê ngân hàng + đối soát + danh sách lệch | ✅ Đã xong dữ liệu + API (mục 10.B) |
| Đa tiền tệ: đơn vị tiền hạch toán, danh mục tiền, tỷ giá, chênh lệch tỷ giá | ✅ Đã xong dữ liệu + API (mục 10.C.1) |
| Thuế GTGT: mã thuế, thuế theo dòng, dòng thuế tự sinh khi ghi sổ, bảng kê GTGT + xuất Excel | ✅ Đã xong dữ liệu + API (mục 10.C.2) |
| Giao diện cho các mục 1–10.A | ✅ Đã gắn UI |
| Giao diện cho 10.B & 10.C (thanh toán, đối soát, công ty, tiền tệ, thuế) | ⏳ Còn lại |
| Đa công ty (cách ly dữ liệu theo `company_id`) | ⏳ Kế hoạch (mục 10.C.3) |
| Migration chính thức + seed demo | ⏳ Còn lại |

*Chi tiết lộ trình xem `DEVELOPMENT_PLAN.md` và `EXTENSION_PLAN.md`.*
