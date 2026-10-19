# Mục 10 — Kế hoạch tiếp theo (bản nối tiếp `EXTENSION_PLAN.md`)

> Tài liệu này ghi lại **phần còn dang dở** của mục 10 sau khi 4 câu hỏi thiết kế đã được chốt.
> Đọc kèm: `EXTENSION_PLAN.md` (phân tích & lộ trình tổng thể), `DEVELOPMENT_PLAN.md` mục 12,
> `Backend/FUTURE_FEATURES.md` mục 10.
>
> Nguyên tắc: mỗi mục dưới đây phải **kiểm chứng được** bằng lệnh chạy thật (`pnpm lint`,
> `pnpm build`, `pnpm test`) hoặc bằng API truy vết — không đánh dấu hoàn thành bằng cảm nhận.

---

## 1. Quyết định đã chốt (ràng buộc thiết kế — không tranh luận lại)

| # | Câu hỏi | Quyết định | Hệ quả kỹ thuật bắt buộc |
| - | ------- | ---------- | ------------------------ |
| 1 | Tài khoản doanh thu/chi phí trên hóa đơn | **Mặc định theo cấu hình** (loại hàng hóa/dịch vụ hoặc quy tắc kế toán); `tax_codes` chỉ cấp thông tin thuế; người dùng **được ghi đè tài khoản theo dòng nếu có phân quyền** | Cần bảng luật mặc định tài khoản + kiểm tra quyền khi ghi đè. **Không** hardcode 511/642 trong service |
| 2 | Giá vốn | **Chỉ hóa đơn dịch vụ — KHÔNG quản lý tồn kho** | Không có bảng kho/giá vốn/COGS theo lô. Ngoài phạm vi: phiếu nhập–xuất kho, bình quân gia quyền, kiểm kê |
| 3 | Đơn vị tiền hạch toán | **Cấu hình được** (`companies.baseCurrency`, mặc định VND) và **quy đổi về tiền hạch toán** | Ngoại tệ lưu `currency` + `fx_amount` + `fx_rate` **trên cùng dòng**; `debit`/`credit` luôn là tiền hạch toán. Cần bảng tỷ giá + công ty có `baseCurrency` |
| 4 | Sao kê | **Chuẩn hóa về một mô hình giao dịch ngân hàng thống nhất**; CSV/JSON và kết nối ngân hàng (sau này) đều đổ vào **cùng một pipeline** | Thiết kế `bank_transactions` chuẩn hóa + interface adapter (`file` trước, `api` sau). Parser/khớp đối soát **không** biết nguồn dữ liệu đến từ đâu |

---

## 2. Hiện trạng trên đĩa (đã kiểm tra, không suy đoán)

### 2.1 Đã có — dùng lại, không viết lại

| Hạ tầng | Trạng thái |
| ------- | ---------- |
| `parties` (entity/DTO/service/controller/module) | ✅ có, controller đủ `GET/POST/PATCH/DELETE` + `/:id/usage` |
| `journal_lines.party_id` + FK + index | ✅ có |
| `journal_entries.source_type` + `source_id` + `UNIQUE(source_type, source_id) WHERE source_id IS NOT NULL` | ✅ có |
| `allocations` (entity + `AllocationsService`: `remainingOfTarget`, `canAllocate`, `allocate`, `unallocate`, `allocatedToTarget`, `allocatedFromSource`) | ✅ có, chưa có controller |
| `common/enums`: `invoice-status`, `bill-status`, `source-type`, `allocation-source-type`, `allocation-target-type` | ✅ có |
| `sales_invoices`/`sales_invoice_lines`, `vendor_bills`/`vendor_bill_lines` (entity + DTO + service + controller + module) | ⚠️ có **khung**: mới có `GET/GET :id/POST/PATCH :id/POST :id/post` |

### 2.2 Build đang ĐỎ — 8 lỗi `tsc` (đã chạy `npx tsc --noEmit`)

```
src/bills/vendor-bills.service.ts(156,39): TS2339 Property 'findOneByCodePattern' does not exist on type 'AccountsService'
src/bills/vendor-bills.service.ts(161,52): TS2345 'string | null' not assignable to 'string'
src/bills/vendor-bills.service.ts(165,46): TS2345 'string' not assignable to 'FiscalPeriod'
src/invoices/sales-invoices.service.ts(197,39): TS2339 Property 'findOneByCodePattern' does not exist on type 'AccountsService'
src/invoices/sales-invoices.service.ts(205,52): TS2345 'string | null' not assignable to 'string'
src/invoices/sales-invoices.service.ts(212,46): TS2345 'string' not assignable to 'FiscalPeriod'
src/invoices/sales-invoices.service.ts(230,7): TS2322 'string | null' not assignable to 'string'
```

Nguyên nhân gốc (đã đối chiếu chữ ký thật của các service được gọi):

1. `AccountsService` **không có** `findOneByCodePattern`. Cần thêm helper tìm tài khoản lá theo tiền tố mã
   (ví dụ `131*`): trả về tài khoản `isActive && isPostable` đầu tiên theo thứ tự mã.
2. `FiscalPeriodsService.assertAcceptsPostings(period: FiscalPeriod)` nhận **đối tượng**, không nhận `id`.
   Đúng cách dùng: `const period = await this.periods.resolveByDate(invoice.date)` rồi
   `this.periods.assertAcceptsPostings(period)`.
3. Các lỗi `string | null` (dòng 161/205/230) do gán `string | null` vào chỗ yêu cầu `string` — cần
   `?? null` / `!` có kiểm tra, không được ép kiểu mù.

### 2.3 Lỗi tiềm ẩn (chưa nổ vì chưa chạy app)

`app.module.ts` dòng 75:

```ts
    // Mục 10.0 — đối tượng (khách hàng / nhà cung cấp) cho sổ cái phụ.    PartiesModule,
```

`PartiesModule` **nằm trong dòng chú thích** ⇒ module không được đăng ký ở gốc ⇒ `PartiesController`
không được mount ⇒ `/api/parties*` **không tồn tại** dù code có. `SalesInvoicesModule` tự import
`PartiesModule` nên DI không báo lỗi — đây là loại lỗi im lặng. **Phải sửa đầu tiên.**

### 2.4 Chưa có gì

- Controller cho `allocations` (phân bổ / hủy phân bổ) — service đã xong nhưng chưa có đường API.
- `approve` / `void` cho hóa đơn bán & hóa đơn mua (mới có `post`).
- Phiếu thu/phiếu chi (`payments`) — chưa có entity/service/controller.
- Báo cáo `receivables-aging`, `payables-aging`, `revenue-by-party`.
- Nâng cấp `debt-reminder` theo đối tượng + tuổi nợ.
- Toàn bộ 10.B (payment intent, provider mô phỏng, sao kê, đối soát).
- FE: chưa có `features/invoices`, `features/bills`, `features/payments`, `features/reconciliation`.
  Hiện có: `accounts, audit, auth, dashboard, jobs, journals, ledger, notifications, parties, periods, profile, reports, users, webhooks`.
  → **Đã xử lý ở P1.6**: `invoices`, `bills`, `payments`, `receivables` + `documents` (component dùng chung).
  ✅ **P2.1** đã có backend `payment-intents` + `reconciliation-exceptions`; còn thiếu FE `payment-intents`,
  và FE/backend sao kê–đối soát `reconciliation` (P2.2/P2.3).
- Test: chưa có spec cho `invoices`, `bills`, `parties`, `allocations`.

---

## 3. Giai đoạn P0 — Sửa để build xanh ✅ HOÀN THÀNH

- [x] **P0.1** Bỏ `PartiesModule` ra khỏi dòng chú thích trong `app.module.ts`.
- [x] **P0.2** Thêm `AccountsService.findOneByCodePattern(prefix)` — tài khoản **lá, đang hoạt động**,
      mã nhỏ nhất khớp tiền tố; + 4 unit test (mã nhỏ nhất · bỏ qua tổng hợp/ngừng dùng · không khớp ⇒
      `null` · tiền tố rỗng ⇒ `null` và không truy vấn).
- [x] **P0.3** Sửa 6 chỗ gọi sai ở `sales-invoices.service.ts` / `vendor-bills.service.ts`:
      `assertAcceptsPostings(period)` (nhận **đối tượng** `FiscalPeriod`, không nhận `id`), thu hẹp
      `string | null` bằng một biến `const` sau khi giải tài khoản công nợ, bỏ `as any`.
- [x] **P0.4** Thay khối `if (status === DRAFT) { … }` tự vấn bằng **một** quy tắc vòng đời:
      `draft | approved ──post──▶ posted`, mọi trạng thái khác bị chặn kèm nhãn trạng thái tiếng Việt.
      Bước `approved` tách riêng vẫn thuộc P1.2.
- [x] **P0.5** `tsc --noEmit` exit 0 · `oxlint` 0 warning/0 error · `vitest` **143/143 xanh** ·
      `nest build` exit 0.
- [x] **P0.6 (phát sinh khi sửa P0.1)** `modules.wiring.spec.ts` đỏ 4 test vì `LedgerModule`/
      `JournalsModule`/`FiscalPeriodsModule`/`AuditModule` kéo theo `PartiesModule` ⇒ repo `Party` chưa
      được override, stub `DataSource` không có `entityMetadatas`. Đã override `getRepositoryToken(Party)`
      ở cả 4 test + ghi chú cảnh báo trong doc comment của stub.
- [x] **P0.7 (phát sinh)** Thêm test chống hồi quy: quét `app.module.ts`, loại chú thích, và khẳng định
      **mọi** `*Module` được import đều thật sự được nạp (phần tử mảng hoặc lời gọi `*.forRoot*/forFeature*`).
      Đã kiểm chứng ngược bộ kiểm tra này: comment `PartiesModule` ⇒ test fail.

**Nghiệm thu P0 — trạng thái thật:**

| Tiêu chí | Kết quả |
| -------- | ------- |
| `tsc --noEmit` exit 0 | ✅ đo được |
| `oxlint` 0 warning | ✅ đo được (trước đó 4 warning) |
| `vitest` 143/143 | ✅ đo được (trước đó 4 failed) |
| `nest build` | ✅ exit 0 |
| `GET /api/parties` mount thật qua HTTP | ⛔ **CHƯA kiểm chứng** — máy không có Postgres (`5432` không listen; chỉ có Redis `6379`; không có Docker). Chỉ mới chứng minh ở mức mã nguồn + DI. Phải chạy lại khi có DB. |

---

## 4. Giai đoạn P1 — Hoàn thiện 10.A (Mini ERP, dịch vụ)

### P1.1 Luật mặc định tài khoản (quyết định #1) ✅ HOÀN THÀNH

| Hạng mục | Trạng thái thật |
| -------- | --------------- |
| Bảng `account_default_rules` | ✅ `id`, `scope`, `category`, `accountId` (FK `accounts`, RESTRICT), `isActive`, `description`, audit columns |
| `AccountDefaultsService.resolveLineAccount` | ✅ giải **4 tầng** (xem dưới) |
| Kiểm quyền ghi đè theo dòng | ✅ chỉ `admin`/`poster`; `maker`/`checker` ⇒ **403** |
| `tax_codes` không quyết định tài khoản | ✅ ghi rõ trong chú thích entity + `AGENTS.md` mục 8 |
| Seed luật nền | ✅ `seed.ts` khai luật `*` cho sales/purchase khi tài khoản đích tồn tại |
| Nối vào chứng từ | ✅ `create`/`update` của hóa đơn bán & mua |
| API + docs | ✅ `/api/account-defaults` (5 route) + `AGENTS.md` mục 8 |
| Kiểm thử | ✅ 15 unit test (`account-defaults.service.spec.ts`) + 3 test wiring module |

**Thứ tự giải tài khoản cho một dòng chứng từ** (một quy tắc duy nhất cho cả `create` và `update`):

1. `accountId` người dùng chỉ định trên dòng — cần quyền `admin`/`poster`,
2. luật theo **đúng** `category`,
3. luật `*` (mọi loại),
4. mặc định hệ thống theo tiền tố mã: `511` (bán) / `642` (mua) — **lưới an toàn**, không phải chính sách.

Mọi nhánh đều trả về tài khoản **lá, đang hoạt động** ⇒ nơi gọi không phải kiểm lại.

**Hai điều chỉnh so với bản kế hoạch đầu (đã kiểm chứng, ghi lại để không mất dấu):**

- **Bỏ cột `priority`.** Kế hoạch đầu tiên vừa yêu cầu `UNIQUE(scope, category)` vừa yêu cầu `priority` —
  hai điều đó mâu thuẫn (một cặp khoá ⇒ một kết quả, `priority` không bao giờ được dùng). Giữ đúng
  `UNIQUE(scope, category)` để việc tra cứu là **xác định**, không phụ thuộc thứ tự.
- **Một cột `accountId` thay vì `revenueAccountId`/`expenseAccountId`.** `scope` đã quyết định đó là tài
  khoản doanh thu hay chi phí; hai cột song song chỉ tạo ra trạng thái "điền sai cột" mà DB không chặn được.

**Ngoài phạm vi P1.1 (vẫn để mở):** luật theo **loại hàng hóa** chi tiết hơn `category` tự khai (cần
bảng danh mục hàng hóa) — chỉ làm khi thật sự cần, vì quyết định #2 chốt là không quản lý tồn kho.

### P1.2 Vòng đời chứng từ & ghi sổ ✅ HOÀN THÀNH

- [x] `approve` và `void` cho hóa đơn bán / hóa đơn mua / phiếu thu-chi — đối xứng với bút toán:
      `draft → approved → posted → voided` (4 endpoint × 3 loại chứng từ).
- [x] **Quy tắc đã chọn (một trong hai): `post` chỉ cho phép từ `approved`.** Không có cờ
      "post trực tiếp" để tránh hai đường đi ghi sổ song song; `checker` duyệt → `poster` ghi sổ
      đúng tách trách nhiệm. Ghi ở `AGENTS.md` mục 8.
- [x] `void` chứng từ **đã ghi sổ** ⇒ bút toán đảo qua `JournalsService.reverseDocument`, chứng từ
      gốc → `voided`. Không sửa/xóa bút toán cũ. **Còn để mở:** bảng `credit_note`/`debit_note` riêng
      (chứng từ điều chỉnh rời) — chưa dựng, giống ghi ở P1.1.
- [x] Mọi lần post đều qua `resolveByDate` + `assertAcceptsPostings`, `source_type`/`source_id` đúng,
      và **cùng transaction với bút toán**: thêm `JournalsService.postDocument(dto, actor, commit)` /
      `reverseDocument(id, dto, actor, commit)` — tạo + ghi sổ + cập nhật chứng từ nằm trong **một**
      transaction, `commit` nhận `manager`. Lỗi giữa hai bước ⇒ rollback toàn bộ, không để lại trạng
      thái "bút toán đã ghi nhưng hóa đơn còn approved" (trước đây chính nó bị `UNIQUE(source_type,
      source_id)` chặn khi thử lại và hóa đơn kẹt vĩnh viễn).
- [x] Chặn ghi trùng: phiếu đã `posted` ⇒ gọi lại idempotent (không sinh bút toán thứ hai); hóa đơn
      `posted`/`voided` ⇒ **400**; `UNIQUE(source_type, source_id)` là lá chắn thứ hai.
- [x] Webhook `*.posted` phát **sau khi commit**; lỗi xếp webhook được ghi log chứ **không** làm hỏng
      kết quả ghi sổ (bù sự kiện bằng `POST /api/webhooks/events`).

### P1.3 Phiếu thu / phiếu chi (`payments`) + phân bổ ✅ HOÀN THÀNH

- [x] Entity `payments`: `code` (unique), `direction` (`receipt` | `payment`), `partyId`, `date`, `amount`,
      `currency`, `method`, `reference`, `idempotencyKey` (unique), `status`, `journalEntryId`, audit columns.
- [x] Ghi sổ: phiếu thu **Nợ 111/112 / Có 131 (party)**; phiếu chi **Nợ 331 (party) / Có 111/112** —
      chạy trong `postDocument` cùng transaction với bút toán.
- [x] Controller phân bổ: `POST`/`GET /api/payments/:id/allocations` +
      `DELETE /api/payments/:id/allocations/:allocationId`.
- [x] Bất biến khi phân bổ (khóa dòng trong transaction): trần theo **dịch** (đã trừ phần của chính
      cặp này, nên "đặt lại" idempotent) và trần theo **nguồn**; mỗi cặp `(nguồn, đích)` một dòng.
- [x] `outstanding` là **giá trị dẫn xuất** (`total − Σ allocations`) — không lưu cột dư.

### P1.4 Báo cáo & job ✅ HOÀN THÀNH

- [x] `GET /api/reports/receivables-aging` + `/payables-aging`: theo đối tượng, nhóm tuổi từ `dueDate`;
      **Σ nhóm = Σ `outstanding` = Σ theo đối tượng** (có unit test riêng).
- [x] `GET /api/reports/revenue-by-party`: đọc `journal_lines` (511 + party) — đã sửa lỗi cột
      `e.date` → `e.entry_date` (SQL thật không tồn tại cột `date` trên `journal_entries`).
- [x] Nâng cấp `debt-reminder`: vẫn đọc sổ cái 131*/331* (khớp báo cáo) **và** thêm phân tích theo
      đối tượng + tuổi nợ từ chứng từ — hai lớp hiện trong một thông báo, cùng `asOfDate`.
- [x] Cron `overdue-invoice-sweep` (09:00 hằng ngày) ⇒ thông báo `audience = poster` (`poster` + `admin`)
      + webhook `invoice.overdue`; không có gì quá hạn thì **không** tạo thông báo, **không** gọi ra ngoài.
- [x] Webhook event mới: `sales_invoice.posted`, `vendor_bill.posted`, `payment.posted`, `invoice.overdue`.

### P1.5 Đối tượng & sổ cái phụ ✅ HOÀN THÀNH

- [x] `GET /api/parties/:id/summary` (số dư hiện tại + tổng phát sinh từ `journal_lines`).
- [x] `GET /api/ledger/sub-ledger` (bắt buộc `partyId`, thêm `accountId` + kỳ/ngày) — cùng khuôn
      `general-ledger`; FE đã có `subledger.api.ts` + `SubLedgerPanel`.
- [x] `JournalTraceability.source: { type, id, code } | null` **bên cạnh** `sourceDocument` — `code`
      đọc từ chính bảng nghiệp vụ (`invoice_no`/`bill_no`/`payment.code`); FE hiển thị số thật này
      và giữ `reference` làm "tham chiếu trên bút toán".

### P1.6 Giao diện 10.A ✅ HOÀN THÀNH

Bốn trang FE cho những API đã có ở P1.1–P1.5 — **không** thêm API mới, chỉ nối UI:

| Trang | Route | Nội dung |
| ----- | ----- | -------- |
| Hóa đơn bán | `/invoices` | danh sách + lọc (trạng thái/khách/số hóa đơn), form dòng, chi tiết, `approve`/`post`/`void` |
| Hóa đơn mua | `/bills` | đối xứng hoàn toàn với hóa đơn bán |
| Phiếu thu / chi | `/payments` | danh sách + lọc, form một cửa cho hai chiều, **hộp thoại phân bổ** vào hóa đơn |
| Công nợ | `/receivables` | tab phải thu/phải trả, tổng + 6 nhóm tuổi (chưa đến hạn · 1–30 · 31–60 · 61–90 · >90 · không có hạn), bảng theo đối tượng và theo chứng từ |

Quyết định kỹ thuật đáng nhớ:

- **`DocumentStatus` dùng chung** cho cả ba loại chứng từ (`draft → approved → posted → voided`)
  — một bảng nhãn, một badge, không có ba bản sao lệch nhau.
- **Thành tiền là giá trị dẫn xuất** (`số lượng × đơn giá`); form gửi `subtotal`/`taxAmount`/`total`
  dạng **chuỗi** 4 chữ số thập phân, backend vẫn kiểm lại `Σ dòng = subtotal` và
  `subtotal + thuế = total` nên UI không thể đẩy số lệch vào sổ.
- **Phân bổ đọc công nợ từ chính báo cáo aging** (`GET /reports/*-aging?partyId=…&includeSettled=true`)
  thay vì tự cộng `total − allocations` ở client — hai màn hình không thể lệch nhau. Bao gồm cả
  chứng từ đã tất toán để dòng đã trả đủ vẫn hiện và **gỡ được** phân bổ.
- **Trần hai bên được kiểm ở client cho phản hồi nhanh, nhưng backend vẫn là nơi quyết định**:
  client cộng lại phần phiếu này đang giữ (`outstanding + đang phân bổ`) để "đặt lại" không bị
  tính hai lần.
- **`idempotencyKey` sinh một lần lúc mở form** → bấm Lưu hai lần do timeout không tạo hai phiếu.
- Form modal **render có điều kiện** (không dùng `setState` trong `useEffect`), đúng rule lint của repo.

**Kiểm chứng giao diện — đã bấm thật trên trình duyệt, không chỉ đọc code:**

Máy vẫn không có PostgreSQL nên dựng **API giả lập** ngoài repo (đúng hình dạng response của backend),
chạy `vite` thật và thao tác qua các luồng:

| Luồng | Kết quả đo được |
| ----- | --------------- |
| Menu dòng hóa đơn `draft` (admin) | có Xem chi tiết / Sửa / Xác nhận / Hủy — **không** có Ghi sổ |
| Bấm Xác nhận → mở lại menu | trạng thái `Đã xác nhận`; menu còn Xem chi tiết / Ghi sổ / Hủy |
| Bấm Ghi sổ | trạng thái `Đã ghi sổ`; hóa đơn xuất hiện trong công nợ |
| Chi tiết hóa đơn | dòng hàng hiển thị `SL × đơn giá`, tạm tính/thuế/tổng khớp |
| Tạo hóa đơn 1 × 750.000 | payload gửi đi `subtotal=750000.0000`, `taxAmount=0.0000`, `total=750000.0000`; dòng `quantity="1.0000"`, `unitPrice="750000.0000"`; **không** gửi `accountId` (để luật mặc định quyết định) |
| Tạo phiếu thu 500.000 | `amount="500000.0000"`, `currency="VND"`, có `idempotencyKey` UUID |
| Phân bổ 1.000.000 vào hóa đơn 1.500.000 của phiếu 2.500.000 | “Đã phân bổ 1.000.000 / còn 1.500.000”; còn nợ hóa đơn 1.500.000 → 500.000; xuất hiện nút Gỡ |
| Nhập vượt trần (1.600.000 khi tối đa 1.500.000) | bị chặn, số đã lưu **không** đổi |
| Công nợ | Σ 6 nhóm = 5.500.000 = tổng còn lại = dòng theo đối tượng (khớp bất biến #1) |

Ảnh chụp: `verification/fe-10a-*.png`. **Giới hạn:** API giả lập chỉ chứng minh UI + hình dạng payload;
**không** chứng minh SQL, khóa `FOR UPDATE`, hay ràng buộc DB — phải chạy lại với backend thật khi có DB.

**Nghiệm thu P1 — trạng thái thật:**

| Tiêu chí | Kết quả |
| -------- | ------- |
| `tsc --noEmit` · `oxlint` · `vitest` · `nest build` (Backend) | ✅ exit 0 · 0 warning/0 error · **194/194** (trước đây 162) · exit 0 |
| `tsc -b` · `oxlint` · `vite build` (Frontend) | ✅ exit 0 · **0 warning/0 error** (110 file) · exit 0 — sau khi thêm 4 trang 10.A |
| Σ nhóm tuổi = Σ `outstanding` = Σ theo đối tượng | ✅ `aging-report.service.spec.ts` (6 test, gồm biên 30/31, 60/61, 90/91 ngày) |
| Vòng đời `draft→approved→posted→voided` + bút toán đảo + webhook `*.posted` | ✅ `sales-invoices.service.spec.ts` (7) + `payments.service.spec.ts` (5) |
| Trần phân bổ theo nguồn/dịch + idempotent theo cặp + chặn phân bổ khi chưa ghi sổ | ✅ `payment-allocations.service.spec.ts` (7); phần khóa `FOR UPDATE` thật chỉ chạy được trên PostgreSQL (test #3 của `EXTENSION_PLAN.md` mục 7) |
| Nhắc công nợ (sổ cái + tuổi nợ) và quét quá hạn (không có gì thì không gửi) | ✅ `debt-reminder.service.spec.ts` (3) + `overdue-invoice-sweep.service.spec.ts` (4) |
| Ghi sổ chứng từ **cùng transaction** với bút toán | ✅ `postDocument`/`reverseDocument`; test xác nhận commit chạy trong transaction |
| DI đủ sau khi 3 module chứng từ import `JobsModule` | ✅ `modules.wiring.spec.ts` (12) + `jobs.boot.spec.ts` (cần Redis) |
| **Chạy một mạch qua HTTP: aging → hóa đơn → bút toán (+ đảo) → vết kiểm toán** | ⛔ **CHƯA kiểm chứng** — máy không có Postgres (như nghiệm thu P0: `5432` không listen, không có Docker). Mới chứng minh ở mức mã nguồn + unit test. **Phải chạy lại khi có DB và ghi biên bản vào đây.** |

**Lỗi thật đã phát hiện & sửa trong lúc làm P1** (để không mất dấu):

1. `revenue-by-party` truy vấn `e.date` — cột của `journal_entries` là `entry_date` ⇒ SQL chạy là lỗi.
2. `modules.wiring.spec.ts` đỏ `ReportsModule` vì `AgingReportService` inject `DataSource`.
3. FE `parties.api.ts` và `subledger.api.ts` bị ghi thành **một dòng duy nhất** với ký tự `\n` literal
   (0 newline) ⇒ `tsc -b` FE hỏng hàng loạt; đã dựng lại đúng nội dung.
4. FE `SubLedgerPanel` truyền `id` cho `TraceJournalView` (prop là `entryId`) và có 2 warning
   `set-state-in-effect`/`exhaustive-deps` — đã sửa: tự chọn đối tượng đầu bằng giá trị **suy ra lúc
   render** thay cho `useEffect`.
5. P1 thêm giá trị cho **enum của Postgres** — dev (`synchronize: true`) tự thêm, môi trường
   `synchronize: false` phải chạy từng câu sau trước khi deploy (repo chưa có thư mục `migrations`):
   - `ALTER TYPE notification_type_enum ADD VALUE 'overdue-invoice';`
   - `ALTER TYPE notification_audience_enum ADD VALUE 'poster';`
   - `ALTER TYPE webhook_event_type_enum ADD VALUE 'sales_invoice.posted';` / `'vendor_bill.posted';` /
     `'payment.posted';` / `'invoice.overdue';`
   (Lưu ý: `webhook_events.event_type` là `varchar` nên không cần đổi; `webhook_deliveries` mới là enum.)

---

## 5. Giai đoạn P2 — 10.B Payment & Reconciliation

### P2.1 Vòng đời thanh toán (quyết định #6 của `EXTENSION_PLAN.md`) ✅ HOÀN THÀNH

- [x] `payment_intents`: `idempotencyKey` (unique), `code`, `date` (ngày hạch toán), `amount`,
      `currency`, `method`, `direction`, `partyId`/`invoiceId` (tùy chọn), `status`, `provider`,
      `providerRef`, `providerStatus`, `attempts`, `lastCheckedAt`, `escalationNotifiedAt`,
      `journalEntryId`, `capturedAt`, `settledAt`.
- [x] Trạng thái: `initiated → authorized → captured → settled`, nhánh `failed`/`refunded`/`expired`, và
      **`unknown`** — timeout **KHÔNG** đồng nghĩa thất bại.
- [x] Hàng đợi BullMQ thứ 5 `payments` + cron `payment-status-poll` (2 phút) tra cứu provider theo đúng
      `idempotencyKey`; ngưỡng leo thang (`PAYMENT_INTENT_MAX_POLLS`, mặc định 5) ⇒ ngoại lệ
      `unresolved_provider_status` + thông báo cho `poster`/`admin`, rồi **ngừng** tra cứu tự động.
      **Không tự suy diễn** kết quả.
- [x] `payment-provider-simulator` (chỉ dev): cố tình timeout lần gọi đầu, "đã thu tiền" ở lần tra cứu sau.
      `PAYMENT_PROVIDER=disabled` là mặc định; đặt `simulator` ở production ⇒ **lỗi khởi động**.
- [x] Bộ điều phối webhook: `payment.captured` ⇒ intent `captured` + **ghi sổ** (`source_type =
      provider_event`) trong cùng transaction. Handler đăng ký qua `WebhooksService.registerInboundHandler`
      để tầng webhook không phụ thuộc ngược vào payment-intents.
- [x] Kết quả **đến trễ** mâu thuẫn trạng thái cuối ⇒ **không ghi đè**, sinh `reconciliation_exception`.

**Quyết định kỹ thuật đã kiểm chứng (ghi lại để không mất dấu):**

- **`source_id = intent.id`, không phải event id.** `UNIQUE(source_type, source_id)` là lá chắn duy nhất
  bảo đảm *một bút toán cho một intent*, kể cả khi webhook và cron cùng lúc thấy "đã thu tiền". Nếu dùng
  event id, hai sự kiện khác nhau của cùng intent sẽ sinh hai bút toán — đúng thứ cần chặn. Event id vẫn
  được lưu trong ngoại lệ/vết.
- **Preflight trước khi gọi provider.** Kỳ kế toán phải mở, tài khoản tiền và tài khoản công nợ phải giải
  được **trước** khi `charge`. Đã thu tiền rồi mới phát hiện không hạch toán được là tình huống không có
  đường sửa sạch.
- **Ngày hạch toán tách khỏi thời điểm thu tiền.** `payment_intents.date` quyết định kỳ của bút toán
  (mặc định hôm nay); nhờ vậy thu tiền cuối tháng có thể hạch toán theo ngày kế toán chọn.
- **Handler nghiệp vụ chạy trước khi lưu `webhook_events`.** Handler lỗi ⇒ chưa có bản ghi, bên gửi nhận
  5xx và retry; mọi thao tác áp kết quả đều idempotent nên retry an toàn. Sự kiện "đến trễ" vẫn được
  chuyển cho nghiệp vụ — chính nó biết là mâu thuẫn cần ngoại lệ hay chỉ là bản cập nhật cũ vô hại.
- **Số tiền trong webhook được đối chiếu.** Lệch với intent ⇒ **không ghi sổ** theo payload, sinh ngoại lệ
  `amount_mismatch`.
- **Bút toán do hệ thống tạo mang `SYSTEM_ACTOR_ID` (UUID rỗng)**, không mượn danh người lập. Vết kiểm
  toán phải nói đúng sự thật: không có con người bấm nút.
- **`PaymentPollRegistry`** để worker `payments` gọi nghiệp vụ thanh toán mà `JobsModule` không phải import
  `PaymentIntentsModule` (module kia đã import `JobsModule`). Module thanh toán tự đăng ký lúc khởi động.

**API:** `GET/POST /api/payment-intents`, `GET /api/payment-intents/:id`,
`POST /api/payment-intents/:id/poll` (admin/poster), `POST /api/payment-intents/:id/settle`,
`GET /api/reconciliation-exceptions`, `GET /:id`, `POST /:id/resolve`, `POST /:id/ignore`.

**Kiểm thử:** `payment-intents.service.spec.ts` (11 test) — timeout ⇒ `unknown` và **không** ghi sổ;
  timeout → captured ghi sổ **đúng một** bút toán với `source_id = intent.id`; poll lại khi đã captured
  không ghi sổ lần hai; webhook captured lặp lại chỉ một bút toán; kết quả đến trễ không ghi đè + sinh
  `late_event_conflict`; lệch tiền sinh `amount_mismatch`; quá ngưỡng leo thang **một lần** rồi dừng;
  kỳ đã khóa chặn **trước** khi gọi provider; cùng `idempotencyKey` không gọi provider lần hai.

**Nghiệm thu P2.1 — trạng thái thật:**

| Tiêu chí | Kết quả |
| -------- | ------- |
| `tsc --noEmit` · `oxlint` · `vitest` · `nest build` | ✅ exit 0 · 0 warning/0 error · **206/206** · exit 0 |
| Kịch bản "provider timeout ở lần gọi đầu" ⇒ cuối cùng `captured` + **đúng một** bút toán | ✅ unit test (simulator + mock repo); **chưa** chạy end-to-end với PostgreSQL |
| Webhook `payment.captured` ⇒ intent `captured` + bút toán trong cùng transaction | ✅ unit test (commit của `postDocument` cập nhật intent); chưa chạy HTTP thật |
| Leo thang sau N lần ⇒ ngoại lệ + thông báo, dừng tra cứu | ✅ unit test |
| Kết quả đến trễ không ghi đè | ✅ unit test |
| Chạy một mạch qua HTTP với DB thật (tạo intent → cron → webhook → sổ) | ⛔ **CHƯA kiểm chứng** — máy dev không có PostgreSQL (như P0/P1). Phải chạy lại khi có DB. |

**Việc còn lại của 10.B:** P2.2 sao kê ngân hàng (`bank_transactions`/`bank_statements`, adapter CSV/API)
và P2.3 khớp 3 tầng + cron `reconciliation-catchup` + dead-letter queue; FE `/payment-intents` và
`/reconciliation`. Khi thêm giá trị enum mới cho Postgres (`synchronize: false`) phải chạy:
`ALTER TYPE payment_intent_status_enum ADD VALUE 'unknown';`
`ALTER TYPE reconciliation_exception_type_enum ADD VALUE 'late_event_conflict';` /
`'unresolved_provider_status';`
`ALTER TYPE reconciliation_exception_status_enum ADD VALUE 'open';` / `'resolved';` / `'ignored';`
(chỉ các giá trị chưa có — enum mới do TypeORM tạo ở lần `synchronize` đầu).

### P2.2 Mô hình giao dịch ngân hàng thống nhất (quyết định #4)

- [ ] `bank_transactions` — **mô hình chuẩn duy nhất**: `id`, `accountId` (111/112), `transactionDate`,
      `valueDate`, `description`, `reference`, `bankRef`, `direction` (`in` | `out`), `amount`,
      `currency`, `source` (`file` | `api`), `sourceRef` (id file / id kết nối), `statementId`, `raw` JSONB,
      `matchStatus` (`matched` | `suggested` | `unmatched`), `UNIQUE(accountId, bankRef, amount, transactionDate)`.
- [ ] Interface `StatementSourceAdapter { parse(input): NormalizedBankTransaction[] }` với hai hiện thực:
      `CsvJsonStatementAdapter` (làm ngay) và `BankApiStatementAdapter` (**khung rỗng**, làm sau — chưa cần
      dịch vụ ngoài).
- [ ] **Cùng một pipeline** cho cả hai nguồn: normalize → chống trùng → khớp → đối soát. Parser **không**
      chứa logic khớp; logic khớp **không** biết dữ liệu đến từ file hay API.
- [ ] Nạp file chạy trong job `statements` (BullMQ) để không chặn request; trả `202` + job id.
- [ ] `bank_statements`: `code`, `accountId`, `statementDate`, `openingBalance`, `closingBalance`, `status`;
      chốt `reconciled` ⇒ **bất biến**.

### P2.3 Khớp & xử lý lệch

- [ ] Khớp 3 tầng: (1) `bankRef`/`reference` + số tiền; (2) số tiền + ngày ±N; (3) gợi ý mờ theo diễn
      giải chứa mã chứng từ. Kết quả mỗi dòng: `matched` | `suggested` | `unmatched`.
- [ ] `reconciliation_matches`: cho phép **n-n**, luôn lưu `amount` từng dòng khớp.
- [ ] `reconciliation_exceptions`: `missing_internal` | `missing_statement` | `amount_mismatch` |
      `duplicate_payment` | `late_event_conflict`; trạng thái `open/resolved/ignored` + `resolvedBy/At`.
- [ ] Quy trình thủ công: tạo bút toán phí/lãi ngân hàng, đánh dấu đã xử lý, hoặc mở điều tra — mọi thao
      tác tự động vào audit log.
- [ ] Cron `reconciliation-catchup` (hằng ngày) + **hoàn tất ⏳ mục 9**: hàng đợi `dead-letter`.

**Nghiệm thu P2:** kịch bản "provider timeout ở lần gọi đầu" chạy end-to-end ⇒ cuối cùng intent `settled`,
**đúng một** bút toán, có vết audit giải thích từng bước. Và: nạp một file CSV **và** một adapter API giả
⇒ cùng đi vào `bank_transactions`, cùng một bảng khớp, không nhánh code riêng.

---

## 6. Giai đoạn P3 — 10.C (đa tiền tệ → thuế → đa công ty)

Làm **theo thứ tự này**, mỗi phần một migration riêng.

- [ ] **Đa tiền tệ trước tiên**, vì quyết định #3 đã chốt là tiền hạch toán **cấu hình được**:
      - [ ] `companies` (`code`, `name`, `taxCode`, **`baseCurrency`**, `isActive`) — tối thiểu phần
            `baseCurrency` để mọi dịch quy đổi có đích đến; phần cách ly dữ liệu để P3.3.
      - [ ] `currencies` (`code`, `name`, `decimals`, `isBase`) + `exchange_rates`
            (`currencyCode`, `rateDate`, `rate`, `source`, `UNIQUE(currencyCode, rateDate)`).
      - [ ] `journal_lines.currency`, `fx_amount`, `fx_rate` (nullable). **`debit`/`credit` luôn là tiền
            hạch toán** ⇒ Σ Nợ = Σ Có không đổi ⇒ báo cáo/trial balance hiện có **không phải sửa**.
      - [ ] Post chứng từ ngoại tệ ⇒ quy đổi về `baseCurrency` tại thời điểm post, lưu cả ba cột.
      - [ ] Tất toán ở tỷ giá khác ⇒ sinh bút toán **chênh lệch tỷ giá** (413 / 515 / 635).
      - [ ] Nguồn tỷ giá: **bảng nhập tay** (`POST /api/exchange-rates`) + seed theo ngày. Tự động lấy tỷ
            giá là hạng mục **tùy chọn về sau** (chưa có nhà cung cấp FX nào được xác nhận — khảo sát trước
            khi tích hợp).
- [ ] **Thuế**: `tax_codes` (`code`, `name`, `rate`, `type`, `outputAccountId` 3331, `inputAccountId` 1331);
      thuế là **lớp tính trên dòng chứng từ**, dòng thuế sinh tự động khi post, **không** nhập tay vào bút
      toán. Báo cáo GTGT đầu vào/đầu ra theo kỳ + xuất Excel (`ReportExportService`).
- [ ] **Đa công ty (cuối cùng, migration riêng 3 bước)**: (1) thêm `company_id` **nullable** + backfill;
      (2) mọi truy vấn lọc theo công ty (`AsyncLocalStorage` — đã có tiền lệ `AuditContext`); (3) chuyển
      **NOT NULL** + đổi unique thành `(company_id, code)`. Kỳ kế toán/số dư/báo cáo tách hoàn toàn.
      ⚠️ `ScopePicker` hiện chỉ chọn **kỳ**, không phải công ty — thêm công tắc chọn công ty riêng.

---

## 7. Frontend còn thiếu

| Trang | Nội dung | Trạng thái |
| ----- | -------- | ---------- |
| Đối tượng | CRUD khách/nhà cung cấp + xem số dư | ✅ `features/parties` (số dư đọc từ `/parties/:id/summary`) |
| Hóa đơn bán | danh sách + form dòng + approve/post/void | ✅ `features/invoices` (P1.6) |
| Hóa đơn mua | đối xứng | ✅ `features/bills` (P1.6) |
| Phiếu thu/chi | danh sách + form + **UI phân bổ** vào hóa đơn | ✅ `features/payments` (P1.6) |
| Công nợ | công nợ hiện tại + aging theo đối tượng | ✅ `features/receivables` (P1.6) |
| Thanh toán | intent + trạng thái + nút tra cứu lại | ⏳ `features/payment-intents` — backend P2.1 đã xong |
| Đối soát | nhập sao kê, bảng khớp, danh sách lệch + xử lý | ⏳ `features/reconciliation` — chờ P2.2/P2.3 |

Component dùng chung cho chứng từ: `features/documents/` — `LineItemsEditor` (dòng hàng, thành tiền dẫn xuất),
`DocumentDetailDialog`, `VoidDocumentDialog` (lý do bắt buộc), `DocumentStatusBadge`, `money.ts`
(`lineAmount`/`sumAmounts`/`subtractAmounts`/`toMoneyString`).

Dùng lại `DataTable`, `DatePicker`, `ScopePicker`, `PageHeader`, `DataStates`, `lib/format`. Không tạo
bộ component mới nếu bộ hiện có đủ dùng. Cập nhật `types/api.ts` + `lib/api.ts` theo quy ước hiện có.

---

## 8. Kiểm thử bắt buộc (bổ sung cho bảng test của `EXTENSION_PLAN.md`)

- [ ] Unit: `findOneByCodePattern`; `AccountDefaultService.resolve` (ưu tiên 3 tầng + chặn ghi đè trái quyền);
      `AllocationsService` (còn lại/canAllocate/vượt trần);
      `StatementSourceAdapter` (CSV và API cho ra **cùng** `NormalizedBankTransaction`).
- [ ] Đồng thời: hai phiếu thu cùng lúc phân bổ vào một hóa đơn, tổng vượt số còn lại ⇒ một thành công,
      một bị chặn, `outstanding` không âm (test #3 của `EXTENSION_PLAN.md`).
- [ ] Bất biến: ghi sổ vào kỳ đã khóa vẫn bị chặn; `UNIQUE(source_type, source_id)` chặn bút toán trùng nguồn.
- [ ] Truy vết: báo cáo aging → hóa đơn → bút toán (+ đảo) → audit log, qua API.
- [ ] Hồi quy: webhook gửi lại cùng `id` không xử lý hai lần.
- [ ] Cập nhật `modules.wiring.spec.ts` khi thêm module mới (module mới **phải** được đăng ký ở gốc).

---

## 9. Thứ tự thực hiện & ước lượng

| Bước | Nội dung | Ước lượng | Phụ thuộc |
| ---- | -------- | --------- | --------- |
| P0 | Sửa build xanh + mount `PartiesModule` + `findOneByCodePattern` | 0,5–1 ngày | — |
| P1.1 | Luật mặc định tài khoản + kiểm tra quyền ghi đè | 3–4 ngày | P0 |
| P1.2 | approve/void/credit-note cho hóa đơn bán & mua | 3–4 ngày | P0 |
| P1.3 | `payments` + API phân bổ | 4–5 ngày | P1.2 |
| P1.4 | Aging + revenue-by-party + nâng cấp nhắc nợ + webhook event | 3–4 ngày | P1.3 |
| P1.5 | party summary + sub-ledger + mở rộng traceability | 2 ngày | P0 |
| P1.6 | ✅ 4 trang FE của 10.A (hóa đơn bán/mua, phiếu, công nợ) | 5–7 ngày | P1 |
| P2 | Payment & Reconciliation (intent, provider sim, sao kê, khớp, lệch) | 4–6 tuần | P1 |
| P3 | Đa tiền tệ → thuế → đa công ty | 4–6 tuần | P1 + P2 |

---

## 10. Định nghĩa hoàn thành phần còn lại

- [ ] `tsc --noEmit`, `lint`, `test` xanh **cả hai app**; `modules.wiring.spec.ts` khớp module thật.
- [ ] `/api/parties*` mount và trả 200 (đã xác minh bằng gọi thật, không chỉ đọc code).
- [ ] Hóa đơn bán/mua chạy đủ `draft → approved → posted → (void)`, void đã ghi sổ sinh bút toán đảo.
- [ ] Phân bổ thanh toán một phần chạy đúng, `outstanding` khớp tổng `allocations`.
- [ ] Con số trên báo cáo aging đi ngược được tới chứng từ nguồn và vết kiểm toán qua API.
- [ ] CSV và adapter API cùng đi vào một `bank_transactions`, một bảng khớp (không nhánh code riêng).
- [x] `FUTURE_FEATURES.md` mục 10, `AGENTS.md` (bảng API + giai đoạn) được cập nhật khớp thực tế
      (quy tắc làm việc #3). `DEVELOPMENT_PLAN.md` mục 12 và `EXTENSION_PLAN.md` vẫn đang mô tả
      kế hoạch gốc — chúng chỉ nên sửa khi P2/P3 chốt lại phạm vi.
- [x] FE 10.A chạy thật trên trình duyệt (danh sách → tạo → duyệt → ghi sổ → phân bổ → công nợ) —
      đã bấm qua toàn bộ luồng ở P1.6 với API giả lập; ảnh ở `verification/`.
- [ ] Chạy lại cùng luồng đó với **backend thật + PostgreSQL** — chưa làm được (`5432` không mở, không Docker).
      Gom chung lần chạy với nghiệm thu HTTP của P0/P1.
- [ ] Ghi rõ **ngoài phạm vi**: quản lý tồn kho/giá vốn theo lô (quyết định #2).

---

## 11. Rủi ro & điểm phải nhớ

| Rủi ro | Giảm thiểu |
| ------ | ---------- |
| Module có code nhưng **không được đăng ký** ⇒ bug im lặng (đã xảy ra với `PartiesModule`) | Sau mỗi module mới: chạy `modules.wiring.spec.ts` + gọi thật 1 route |
| Ghi đè tài khoản trái quyền ở tầng API mà không chặn ở service | Kiểm quyền **trong service**, không chỉ ở controller/guard |
| `outstanding` bị lưu thành cột và lệch dần | Luôn tính từ `allocations`; nếu cache thì phải có job đối chiếu |
| Quy đổi ngoại tệ ghi vào `debit`/`credit` ⇒ phá cân bằng | `debit`/`credit` **chỉ** tiền hạch toán; ngoại tệ ở cột riêng |
| Nguồn sao kê thứ hai sinh nhánh code thứ hai | Adapter + mô hình chuẩn; test "cùng output" cho cả hai adapter |
| Trạng thái thanh toán kẹt ở `unknown` | Ngưỡng leo thang + notification; **không** tự kết luận thất bại |

---

_Tài liệu liên quan: `EXTENSION_PLAN.md` · `DEVELOPMENT_PLAN.md` · `Backend/FUTURE_FEATURES.md` ·
`../../../AGENTS.md`._
