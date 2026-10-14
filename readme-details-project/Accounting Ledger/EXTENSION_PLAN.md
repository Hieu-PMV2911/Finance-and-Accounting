# Mục 10 — Kế hoạch mở rộng (dài hạn)

> Mở rộng lõi Accounting Ledger (mục 1–9 đã xong) thành **Mini ERP** (bán/mua hàng, công nợ,
> thanh toán một phần) và **Payment & Reconciliation** (vòng đời thanh toán, đối soát sao kê),
> từ đó lên **đa tiền tệ, đa công ty, thuế**.
>
> Bám sát `Future-project.txt` (Dự án 2 & 3), `Details-develop.txt` (tháng 7–10) và
> `DEVELOPMENT_PLAN.md` mục 12. Tài liệu này là bản chi tiết của **mục 10** trong
> `Backend/FUTURE_FEATURES.md`.

---

## 1. Phân tích — mục 10 thực chất đang hỏi gì

Ba gạch đầu dòng của mục 10 hiện tại gộp **bốn năng lực rất khác nhau** về bản chất kỹ thuật:

| Nhóm                        | Bản chất                                                    | Điểm khó thật sự                                                                                            |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mini ERP (hóa đơn, công nợ) | Biến **lõi sổ cái** thành **quy trình chứng từ**            | Chứng từ nguồn phải sinh bút toán **đúng một lần**, sửa sai bằng chứng từ điều chỉnh chứ không sửa bút toán |
| Payment & Reconciliation    | **Hệ phân tán** có timeout, retry, webhook, kết quả đến trễ | Phân biệt "chưa biết" với "thất bại"; phục hồi mà không tạo giao dịch trùng                                 |
| Đa tiền tệ                  | **Chiều phân tích thêm trên số tiền**                       | Giữ sổ cái nhất quán khi có ngoại tệ + chênh lệch tỷ giá khi tất toán                                       |
| Đa công ty, thuế            | **Thay đổi xuyên suốt (cross-cutting)**                     | Cách ly dữ liệu theo công ty mà không phải viết lại mọi query; thuế là lớp tính trên chứng từ               |

Ba gạch đầu dòng đó **không đủ để bắt tay làm**: thiếu thứ tự phụ thuộc, thiếu mô hình dữ liệu,
thiếu tiêu chí nghiệm thu. Đó là lý do bản kế hoạch này tồn tại.

**Hai yêu cầu gốc quyết định toàn bộ thiết kế:**

- _(Mini ERP)_ "mỗi nghiệp vụ có thể **truy ngược từ báo cáo đến bút toán, chứng từ nguồn và lịch sử thay đổi**".
- _(Payment)_ "giải thích được vì sao **timeout không đồng nghĩa với thanh toán thất bại**, và cách
  **phục hồi mà không tạo giao dịch trùng**".

Cả hai đều đã có **một nửa** trong code hiện tại: truy vết (`GET /api/audit-logs/traceability/...`)
và chống ghi trùng (idempotency key + webhook `late`). Việc của mục 10 là **nối vào** chứ không xây lại.

---

## 2. Hiện trạng — tài sản tái dùng được (không viết lại)

| Hạ tầng đang có                                                                                                                    | Dùng cho mục 10                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `JournalsService` (draft→approved→posted→reversed, cân bằng Nợ/Có, `entryNo` cấp bằng `pg_advisory_xact_lock`, khóa bi quan số dư) | **Bộ máy ghi sổ duy nhất**: mọi chứng từ của mục 10 ghi sổ bằng cách gọi service này trong cùng transaction |
| `journal_entries.idempotencyKey` (unique)                                                                                          | Chống tạo trùng khi client/bên thứ ba retry                                                                 |
| `journal_entries.reference` ("số chứng từ gốc") + `AuditService.traceJournalEntry`                                                 | Truy vết — sẽ được **cấu trúc hóa** thay vì chỉ là chuỗi tự do                                              |
| `AuditSubscriber` (ghi vết **trong cùng transaction**, before/after)                                                               | "lịch sử thay đổi" của hóa đơn/phiếu thu/thanh toán — **miễn phí**, tự động                                 |
| `account_balances` + `LedgerQueryService` (số dư tái lập từ `journal_lines`, `LEDGER_STATUSES`)                                    | Công nợ/aging **đọc thẳng từ `journal_lines`**, không phụ thuộc bảng tổng hợp                               |
| `jobs` (4 hàng đợi BullMQ + `job_runs` có retry + cron)                                                                            | Job mới của mục 10 chỉ cần thêm processor/schedule                                                          |
| `webhook_endpoints/deliveries/events` + `POST /webhooks/inbound` (idempotent theo `id`, phát hiện `late`, sai chữ ký ⇒ 401)        | **Hạ tầng nhận kết quả thanh toán đến trễ đã có sẵn** — mục 10 chỉ cần bộ điều phối theo `event.type`       |
| `notifications` (phạm vi theo người nhận + vai trò)                                                                                | Nhắc nợ quá hạn, cảnh báo đối soát lệch                                                                     |
| RBAC `maker/checker/poster/admin` + guard theo trạng thái chứng từ                                                                 | Hóa đơn & phiếu thu/chi **dùng lại đúng vòng đời duyệt** của bút toán                                       |
| `MoneyUtil` (`NUMERIC(19,4)` + `decimal.js`), `ReportExportService` (xlsx/pdf Unicode), `DataTable`, `DatePicker`, `ScopePicker`   | Tiền, xuất báo cáo, UI danh sách, chọn ngày, chọn phạm vi                                                   |

**Kết luận phân tích:** rủi ro lớn nhất của mục 10 **không** nằm ở thuật toán, mà ở **mô hình dữ liệu**:
bốn chiều thông tin còn thiếu khiến mọi thứ (aging, đối soát, ngoại tệ) không thể tính đúng.

---

## 3. Khoảng trống → bốn trục phải bổ sung

| Chiều còn thiếu                | Hiện tại                                                                                                                        | Hệ quả nếu không bổ sung                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Đối tượng (party)**          | Công nợ chỉ theo **tài khoản** 131*/331*; `debt-reminder` ghi rõ "chưa phân tích theo tuổi nợ hay theo từng khách/nhà cung cấp" | Không biết ai nợ mình ⇒ không có aging, không nhắc nợ theo đối tượng                         |
| **Chứng từ nguồn có cấu trúc** | Chỉ có `reference` (chuỗi 64 ký tự, tự do)                                                                                      | Truy vết dừng ở "số hóa đơn" dạng text; không kiểm soát được "một chứng từ = một bút toán"   |
| **Phân bổ (allocation)**       | Không có                                                                                                                        | Thanh toán một phần / một khoản trả nhiều hóa đơn không biểu diễn được ⇒ công nợ còn lại sai |
| **Tiền tệ & đơn vị**           | Mọi số tiền là một loại tiền duy nhất; không có `currency`                                                                      | Đa tiền tệ, chênh lệch tỷ giá, đa công ty không có chỗ đứng                                  |

> Bốn trục này là **nền chung** cho cả ba dự án con. Làm riêng lẻ từng dự án sẽ phải sửa lại
> schema hai lần — nên chúng nằm ở **Giai đoạn 10.0**.

---

## 4. Quyết định kiến trúc (chốt trước khi code)

1. **Không có "bộ máy ghi sổ thứ hai".** Hóa đơn/phiếu thu/thanh toán **không tự viết** Nợ–Có;
   chúng gọi `JournalsService` trong cùng transaction. Bù lại, mọi chứng từ có **bút toán gắn kèm**
   và bút toán đó bất biến như cũ.
2. **Một chứng từ nguồn ⇒ tối đa một bút toán gốc.** Enforce ở DB:
   `UNIQUE (source_type, source_id)` trên `journal_entries` (bỏ qua NULL). Đây là lá chắn thứ hai
   sau `idempotencyKey`.
3. **Sổ cái phụ theo đối tượng nằm trên `journal_lines`.** Thêm `party_id` (nullable) thay vì đẻ
   tài khoản con cho từng khách (`1311`, `1312`, …) — giữ Chart of Accounts sạch, và **số dư theo
   đối tượng vẫn tái lập được từ `journal_lines`** (đúng nguyên tắc đối chiếu ở mục 6).
4. **Sổ cái luôn ở đồng tiền hạch toán.** `debit`/`credit` giữ nguyên nghĩa "tiền hạch toán (VND)";
   ngoại tệ lưu thêm `currency` + `fx_amount` + `fx_rate` **trên cùng dòng**. Nhờ vậy toàn bộ báo
   cáo, trial balance, cân bằng Nợ/Có hiện có **không phải sửa**.
5. **Sửa sai bằng chứng từ mới, không sửa bút toán.** Hóa đơn đã ghi sổ → `void` bằng credit/debit
   note sinh bút toán đảo. Đã ghi sổ = bất biến (bất biến #2 của mục 5).
6. **Timeout là "chưa biết", không phải "thất bại".** Trạng thái thanh toán có nhánh
   `unknown/pending_verification`; chỉ chuyển `failed` khi có **bằng chứng kết luận** (truy vấn
   provider hoặc webhook). Mọi thao tác phục hồi dùng lại đúng `idempotencyKey` cũ.
7. **Đa công ty làm sau cùng và độc lập.** Nó chạm mọi bảng ⇒ phải là migration riêng
   (nullable → backfill → NOT NULL), không trộn vào giai đoạn tính năng.

---

## 5. Lộ trình

| Giai đoạn | Nội dung                                                                        | Ước lượng | Phụ thuộc                           |
| --------- | ------------------------------------------------------------------------------- | --------- | ----------------------------------- |
| **10.0**  | Nền chung: party, chứng từ nguồn có cấu trúc, phân bổ, sổ cái phụ               | 2 tuần    | —                                   |
| **10.A**  | Mini ERP — vòng mua/bán, công nợ, aging, thanh toán một phần                    | 6–8 tuần  | 10.0                                |
| **10.B**  | Payment & Reconciliation — vòng đời thanh toán, webhook, sao kê, danh sách lệch | 6–8 tuần  | 10.0 (và 10.A để đối soát có nghĩa) |
| **10.C**  | Nâng cao: đa tiền tệ → thuế → đa công ty                                        | 4–6 tuần  | 10.A + 10.B                         |

> `Future-project.txt` liệt kê Payment là "Dự án 2"; nhưng **đối soát chỉ có nghĩa khi đã có giao
> dịch nội bộ để đối chiếu** (hóa đơn + phiếu thu/chi + công nợ). Vì vậy bản kế hoạch này đảo thứ
> tự thực thi (10.A trước 10.B) — nếu muốn giữ đúng thứ tự tài liệu gốc thì 10.B vẫn chạy được trên
> 10.0, chỉ là phần đối soát sẽ đối chiếu với bút toán thủ công.

---

### 10.0 — Nền chung (2 tuần)

**Mô hình dữ liệu**

- `parties` — `id`, `code` (unique), `type` (`customer` | `vendor` | `both`), `name`, `taxCode`,
  `address`, `contactName/phone/email`, `paymentTermDays`, `creditLimit`, `isActive`, audit columns.
- `journal_lines.party_id` (uuid, nullable, FK `parties`, `ON DELETE RESTRICT`) + index
  `(party_id, entry_date)`; `journal_entries.source_type` (enum: `manual` | `sales_invoice` |
  `vendor_bill` | `payment` | `bank_transaction` | `provider_event`) và `source_id` (uuid, nullable)
  với `UNIQUE (source_type, source_id) WHERE source_id IS NOT NULL`.
- `allocations` — `id`, `target_type` (`sales_invoice` | `vendor_bill`), `target_id`,
  `source_type` (`payment` | `credit_note`), `source_id`, `amount NUMERIC(19,4)`, `createdBy`,
  `createdAt`. Một bảng dùng chung cho cả phải thu và phải trả.

**Bất biến mới (phải enforce ở service, kiểm tra trong transaction + khóa dòng)**

1. `party_id` chỉ hợp lệ trên dòng thuộc tài khoản công nợ (131*/331*) — validate theo tiền tố
   hoặc bảng cấu hình `account_usage`.
2. Σ `allocations.amount` theo `(target)` ≤ tổng tiền chứng từ đích; theo `(source)` ≤ số tiền chứng từ nguồn.
3. Mỗi cặp `(source, target)` chỉ có **một** dòng phân bổ (cộng dồn vào dòng đó, không tạo trùng).
4. Bút toán có `source_type ≠ manual` **bắt buộc** có `source_id` (và ngược lại).

**API**

| Method                | Route                      | Quyền                                     | Ghi chú                                                                              |
| --------------------- | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| GET/POST/PATCH/DELETE | `/api/parties`             | đọc: đã đăng nhập · ghi: **admin, maker** | lọc `type`/`isActive`/`search`; xóa bị chặn khi đã phát sinh                         |
| GET                   | `/api/parties/:id/summary` | đã đăng nhập                              | số dư hiện tại + tổng phát sinh theo `journal_lines`                                 |
| GET                   | `/api/ledger/sub-ledger`   | đã đăng nhập                              | sổ cái phụ: lọc `partyId` (+ `accountId`, kỳ/ngày) — cùng khuôn với `general-ledger` |

**Task**

- [ ] Entity + DTO + service + controller cho `Party`; xóa mềm/khóa thay vì xóa cứng khi đã phát sinh.
- [ ] Migration: thêm cột mới (nullable) trên `journal_entries`/`journal_lines`; **không** đụng dữ liệu cũ.
- [ ] `JournalsService` nhận `sourceType`/`sourceId`/`partyId` trong DTO; kiểm tra trùng nguồn.
- [ ] `AllocationService` (thuần domain): phân bổ, hủy phân bổ, tính "còn lại" của chứng từ — unit test
      không cần DB.
- [ ] Mở rộng `JournalTraceability`: thêm `source: { type, id, code } | null` **bên cạnh** `sourceDocument`
      (giữ field cũ để FE hiện tại không vỡ).
- [ ] FE: trang **Đối tượng** (khách/nhà cung cấp) + chọn đối tượng trong form bút toán (tùy chọn).

**Nghiệm thu:** `party_id` trên dòng công nợ ⇒ tổng theo `(tài khoản, đối tượng)` **bằng** số dư
tính theo `account_balances`; `UNIQUE(source_type, source_id)` chặn được bút toán trùng nguồn.

---

### 10.A — Mini ERP (6–8 tuần)

**Chứng từ**

- `sales_invoices` + `sales_invoice_lines`: `code`, `partyId`, `invoiceDate`, `dueDate`, `currency`
  (giữ chỗ cho 10.C), `description`, dòng: `description`, `quantity`, `unitPrice`, `taxRate`,
  `revenueAccountId`, `amount`. Tổng: `subtotal`, `taxTotal`, `total`, `allocatedTotal`, `outstanding`
  (hai giá trị cuối là **dẫn xuất**, tính từ `allocations`).
- `vendor_bills` + `vendor_bill_lines`: đối xứng, `expenseAccountId` thay cho tài khoản doanh thu.
- `payments` (phiếu thu/phiếu chi): `code`, `direction` (`receipt` | `payment`), `partyId`,
  `amount`, `method` (`cash` | `bank_transfer` | `other`), `date`, `reference`, `idempotencyKey`,
  `status`.

**Vòng đời & ghi sổ**

```
draft ──approve──▶ approved ──post──▶ posted ──(void)──▶ voided
                                        │
                                        └─ outstanding: 0 = settled · 0 < x < total = partially_paid
```

- Post hóa đơn bán: **Nợ 131 (party)** / **Có 511** / **Có 3331** (VAT) — qua `JournalsService`,
  cùng transaction, `source_type = sales_invoice`.
- Post phiếu thu: **Nợ 111/112** / **Có 131 (party)**; sau khi ghi sổ mới cho phân bổ vào hóa đơn.
- RBAC y như bút toán: `maker` lập · `checker` duyệt · `poster` ghi sổ · `admin` toàn quyền.
- Void hóa đơn đã ghi sổ ⇒ sinh chứng từ điều chỉnh (credit note) + bút toán đảo; hóa đơn gốc → `voided`.

**Thanh toán một phần**

- Phiếu thu 50 triệu phân bổ vào 3 hóa đơn (30 + 15 + 5) → 3 dòng `allocations`.
- Hóa đơn 100 triệu nhận 2 phiếu thu (40 + 60) → `outstanding` về 0 ⇒ `settled`.
- Phân bổ/xóa phân bổ là thao tác **thủ công có kiểm soát** (không tự động "khớp hết") và **không**
  sinh bút toán mới — bút toán đã đúng ở mức tổng; phân bổ chỉ là lớp phân tích công nợ.

**Báo cáo & job**

- `GET /api/reports/receivables-aging` — công nợ phải thu theo đối tượng, bucket `≤30 / 31–60 / 61–90 / >90`
  ngày tính từ `dueDate`; đối xứng `payables-aging` cho phải trả.
- `GET /api/reports/revenue-by-party` — doanh thu theo khách/kỳ (đọc `journal_lines` tài khoản 511 + party).
- **Nâng cấp `debt-reminder`** (mục 9 đang chỉ dùng 131*/331*): chuyển sang phân tích **theo từng
  đối tượng + tuổi nợ**, dùng đúng dữ liệu hóa đơn mới. Cron mới `overdue-invoice-sweep` (hằng ngày)
  ⇒ notification cho `poster/admin` + webhook `invoice.overdue`.
- Webhook event mới: `sales_invoice.posted`, `vendor_bill.posted`, `payment.posted`, `invoice.overdue`.

**FE:** Khách hàng/Nhà cung cấp · Hóa đơn bán · Hóa đơn mua · Phiếu thu/Phiếu chi · **Công nợ**
(công nợ hiện tại + aging). Dùng lại `DataTable`, `DatePicker`, `ScopePicker`.

**Nghiệm thu (đúng tiêu chí kỹ thuật của dự án):** từ số **trên báo cáo aging** → mở hóa đơn →
mở bút toán và bút toán đảo → xem **vết kiểm toán** của hóa đơn, **tất cả bằng API truy vết**,
không cần đọc log.

---

### 10.B — Payment & Reconciliation (6–8 tuần)

**Vòng đời thanh toán**

`payment_intents`: `id`, `idempotencyKey` (unique), `amount`, `currency`, `method`,
`partyId`/`invoiceId` (tùy chọn), `status`, `providerRef`, `attempts`, `lastCheckedAt`.

```
initiated ─▶ authorized ─▶ captured ─▶ settled
    │             │            │
    │             └──▶ failed  └──▶ refunded
    └──▶ expired          ▲
                          └── unknown / pending_verification  ← "timeout chưa phải thất bại"
```

- **Timeout ≠ failed.** Hết thời gian chờ ⇒ `unknown`, **không** kết luận, **không** post "thất bại".
  Job `payment-status-poll` (mỗi 2 phút) truy vấn provider theo `idempotencyKey` cho tới khi có kết
  luận chắc chắn. Trả lời phỏng vấn: _mất kết nối chỉ làm ta mất thông tin, không làm giao dịch biến mất._
- **Provider mô phỏng** (module `payment-provider-simulator`, chỉ dev): cố tình trả timeout ở lần gọi
  đầu, "đã thu tiền" ở lần tra cứu sau ⇒ tái hiện được đúng tình huống khó.
- **Nhận kết quả:** tái dùng webhook mục 9 (`POST /webhooks/inbound` — idempotent theo `id`, phát
  hiện `late`). Thêm **bộ điều phối**: `payment.captured` ⇒ intent → `captured` + ghi sổ
  (`source_type = provider_event`, `source_id = event.id`) trong cùng transaction.
- **Kết quả đến trễ:** nếu event cũ mâu thuẫn trạng thái cuối ⇒ **không ghi đè**, sinh
  `reconciliation_exception` để người xử lý. (Đây là "xử lý kết quả đến trễ" ở mức nghiệp vụ, không
  chỉ ở mức giao vận.)
- **Phục hồi không tạo trùng:** mọi lần thử lại dùng **cùng `idempotencyKey`**; DB có unique key ⇒
  kể cả 2 request đồng thời cũng chỉ 1 intent và 1 bút toán.

**Sao kê & đối soát**

- `bank_statements` (`code`, `accountId` 111/112, `statementDate`, `openingBalance`, `closingBalance`,
  `status`) + `bank_statement_lines` (`date`, `description`, `reference`, `bankRef`, `direction`,
  `amount`, `raw` JSONB).
- Nhập sao kê: `POST /api/bank-statements` (CSV/JSON — sao kê **giả lập** theo yêu cầu gốc) →
  parser chạy trong job `statements` (BullMQ) để không chặn request.
- **Khớp 3 tầng:** (1) chính xác `bankRef`/`reference` + số tiền; (2) số tiền + ngày ± N ngày;
  (3) gợi ý mờ (diễn giải chứa mã chứng từ). Kết quả mỗi dòng: `matched` | `suggested` | `unmatched`.
- `reconciliation_matches` (`statementLineId`, `targetType`, `targetId`, `amount`, `matchedBy`,
  `matchedAt`) — cho phép **n-n** (một khoản thu gộp khớp nhiều hóa đơn; một dòng sao kê khớp nhiều
  chứng từ hoặc ngược lại).
- `reconciliation_exceptions`: `type` (`missing_internal` | `missing_statement` | `amount_mismatch` |
  `duplicate_payment` | `late_event_conflict`), `detail`, `status` (`open` | `resolved` | `ignored`),
  `resolvedBy/At`. Quy trình thủ công: **tạo bút toán phí/lãi ngân hàng**, đánh dấu đã xử lý, hoặc
  mở điều tra. Mọi thao tác đã tự động vào audit log.
- Chốt sao kê: `status = reconciled` khi mọi dòng không còn `unmatched` **hoặc** phần còn lại đã được
  xử lý tường minh — sao kê đã chốt là **bất biến**.

**Job/cron/queue mới**

| Tên                         | Loại           | Việc                                                                 |
| --------------------------- | -------------- | -------------------------------------------------------------------- |
| `payments` (hàng đợi thứ 5) | BullMQ         | tra cứu provider, ghi sổ khi captured, backoff riêng                 |
| `payment-status-poll`       | cron 2 phút    | quét intent `unknown`/`authorized` treo                              |
| `reconciliation-catchup`    | cron hằng ngày | tự khớp lại + báo cáo lệch tồn đọng                                  |
| `dead-letter`               | hạ tầng        | **hoàn tất ⏳ của mục 9**: hàng đợi riêng cho job thất bại vĩnh viễn |

**FE:** trang **Thanh toán** (danh sách intent + trạng thái + tra cứu lại) và **Đối soát** (nhập sao
kê, bảng khớp, danh sách lệch + xử lý).

**Nghiệm thu:** kịch bản "provider timeout ở lần gọi đầu" chạy end-to-end ⇒ cuối cùng intent
`settled`, **đúng một** bút toán, và có vết audit giải thích từng bước.

---

### 10.C — Nâng cao (4–6 tuần)

**Đa tiền tệ (làm trước tiên trong nhóm này)**

- `currencies` (`code`, `name`, `decimals`, `isBase`) + `exchange_rates` (`currencyCode`, `rateDate`,
  `rate`, `source`, `UNIQUE(currencyCode, rateDate)`).
- `journal_lines.currency`, `fx_amount`, `fx_rate` (nullable) — xem quyết định #4 ở mục 4. Bút toán
  ngoại tệ vẫn cân bằng **theo đồng tiền hạch toán** ⇒ không phá bất biến Σ Nợ = Σ Có.
- Tất toán ngoại tệ ở tỷ giá khác ⇒ sinh bút toán **chênh lệch tỷ giá** (413 / 515 / 635).
- **Nguồn tỷ giá:** mặc định **bảng tỷ giá nhập tay** (`POST /api/exchange-rates` + seed theo ngày) —
  đúng thông lệ kế toán Việt Nam (doanh nghiệp tự chọn tỷ giá hạch toán) và không phụ thuộc dịch vụ
  ngoài. Tự động hóa lấy tỷ giá là hạng mục **tùy chọn về sau**; danh mục dịch vụ đã tra **không có
  nhà cung cấp tỷ giá FX nào**, nên nếu muốn thì phải khảo sát riêng trước khi tích hợp.

**Thuế**

- `tax_codes` (`code`, `name`, `rate`, `type` VAT/GTGT, `outputAccountId` 3331, `inputAccountId` 1331).
- Thuế là **lớp tính trên dòng chứng từ** (hóa đơn lưu `taxRate`/`taxCode`), **không** nhập tay vào
  bút toán. Dòng thuế được sinh tự động khi post.
- Báo cáo: tổng hợp GTGT đầu vào/đầu ra theo kỳ + xuất Excel (dùng lại `ReportExportService`).

**Đa công ty (làm cuối, migration riêng)**

- `companies` (`code`, `name`, `taxCode`, `baseCurrency`, `isActive`); thêm `company_id` vào **mọi**
  bảng nghiệp vụ (accounts, fiscal_periods, journal_entries, journal_lines via entry, parties,
  hóa đơn, payments, sao kê…).
- Chiến lược 3 bước: (1) thêm cột **nullable** + backfill công ty mặc định; (2) mọi truy vấn lọc theo
  công ty — dùng `AsyncLocalStorage` (đã có tiền lệ `AuditContext`) hoặc global scope của TypeORM;
  (3) chuyển **NOT NULL** + đổi unique key thành `(company_id, code)`.
- Kỳ kế toán, số dư, báo cáo tách hoàn toàn theo công ty; UI cần thêm **công tắc chọn công ty** ở
  thanh trên — đặt cạnh `ScopePicker` (đang chọn kỳ kế toán) theo cùng một khuôn. ⚠️ `ScopePicker`
  hiện có chỉ chọn **kỳ**, không phải công ty — đừng nhầm khi làm.

---

## 6. Bề mặt API dự kiến (mục 10)

| Nhóm              | Route chính                                                                                                                                                                                                             | Quyền                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Đối tượng         | `GET/POST/PATCH/DELETE /api/parties`, `GET /api/parties/:id/summary`                                                                                                                                                    | đọc: đã đăng nhập · ghi: **admin, maker** |
| Sổ cái phụ        | `GET /api/ledger/sub-ledger`                                                                                                                                                                                            | đã đăng nhập                              |
| Hóa đơn bán       | `GET/POST/PATCH /api/sales-invoices`, `POST /:id/approve`, `POST /:id/post`, `POST /:id/void`                                                                                                                           | maker/checker/poster như bút toán         |
| Hóa đơn mua       | `GET/POST/PATCH /api/vendor-bills`, `POST /:id/approve` · `POST /:id/post` · `POST /:id/void`                                                                                                                           | như trên                                  |
| Phiếu thu/chi     | `GET/POST /api/payments`, `POST /:id/post`, `POST /:id/allocations`, `DELETE /:id/allocations/:allocationId`                                                                                                            | như trên                                  |
| Thanh toán        | `GET/POST /api/payment-intents`, `GET /:id`, `POST /:id/refresh`                                                                                                                                                        | **admin, poster**                         |
| Sao kê & đối soát | `POST/GET /api/bank-statements`, `GET /:id/lines`, `POST /api/bank-statements/:id/auto-match`, `POST /api/reconciliation-matches`, `DELETE /api/reconciliation-matches/:id`, `GET/PATCH /api/reconciliation-exceptions` | **admin, poster**                         |
| Báo cáo           | `GET /api/reports/receivables-aging`, `/payables-aging`, `/revenue-by-party`, (10.C) `/tax-summary`, `/exchange-rates`                                                                                                  | đã đăng nhập                              |

Giữ nguyên quy ước mã HTTP hiện có: chuyển trạng thái trả **200**, tạo mới **201**, xóa **204**.
Sửa hành vi ⇒ cập nhật bảng API ở `AGENTS.md` mục 8 (quy tắc làm việc #3).

---

## 7. Kiểm thử bắt buộc (đặc trưng của mục 10)

| #   | Kịch bản                                                                       | Kỳ vọng                                                                               |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | Hai request tạo cùng hóa đơn / cùng phiếu thu (cùng `idempotencyKey`)          | **một** chứng từ, **một** bút toán                                                    |
| 2   | Hai chứng từ cùng `source_type`/`source_id`                                    | Post thứ hai bị từ chối (unique)                                                      |
| 3   | Hai phiếu thu **đồng thời** phân bổ vào cùng một hóa đơn, tổng vượt số còn lại | Một cái thành công, một cái bị chặn — `outstanding` không âm                          |
| 4   | Provider timeout ở lần gọi đầu, tra cứu lại thấy captured                      | Cuối cùng `settled`; **đúng một** bút toán; không có intent trùng                     |
| 5   | Webhook kết quả **đến trễ** mâu thuẫn trạng thái cuối                          | Không ghi đè; sinh `reconciliation_exception`                                         |
| 6   | Webhook gửi lại **cùng `id`**                                                  | Không xử lý hai lần (đã có ở mục 9 — test hồi quy)                                    |
| 7   | Số dư công nợ theo đối tượng                                                   | Bằng tổng `journal_lines` của `(131/331, party)` và bằng `account_balances`           |
| 8   | Aging                                                                          | Tổng các bucket = tổng `outstanding`; hóa đơn ở đúng bucket theo `dueDate`            |
| 9   | Truy vết                                                                       | Từ báo cáo aging → hóa đơn → bút toán (+ bút toán đảo) → vết kiểm toán, qua API       |
| 10  | Ghi sổ vào kỳ đã khóa                                                          | Vẫn bị chặn (hồi quy bất biến #3)                                                     |
| 11  | Ngoại tệ (10.C)                                                                | Tất toán ở tỷ giá khác sinh bút toán chênh lệch; Σ Nợ = Σ Có theo đồng tiền hạch toán |
| 12  | Đa công ty (10.C)                                                              | Dữ liệu công ty A không rò sang công ty B; unique key theo `(company_id, code)`       |

---

## 8. Đối chiếu yêu cầu gốc → hạng mục kế hoạch

| Yêu cầu (`Future-project.txt`)                           | Hạng mục                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Customer, Vendor                                         | 10.0 `parties`                                                         |
| Sales Invoice, Vendor Bill                               | 10.A chứng từ                                                          |
| Theo dõi công nợ                                         | 10.A aging + `sub-ledger`                                              |
| Thanh toán một phần                                      | 10.A `allocations` + `payments`                                        |
| Ghi nhận nghiệp vụ vào sổ cái                            | 10.0 quyết định #1 (mọi chứng từ đi qua `JournalsService`)             |
| Báo cáo công nợ và doanh thu                             | 10.A `receivables-aging`, `revenue-by-party`                           |
| Phân quyền, phê duyệt, lịch sử thao tác                  | Tái dùng RBAC + `AuditSubscriber`; thêm approve/post/void cho chứng từ |
| Truy ngược báo cáo → bút toán → chứng từ nguồn → lịch sử | 10.0 `sourceType/sourceId` + mở rộng `JournalTraceability`             |
| Nhận yêu cầu thanh toán & quản lý trạng thái             | 10.B `payment_intents`                                                 |
| Idempotency chống xử lý lặp                              | 10.B unique `idempotencyKey` + unique nguồn                            |
| Webhook giả lập, retry, kết quả đến trễ                  | 10.B điều phối trên webhook mục 9 + provider mô phỏng                  |
| Đối soát nội bộ với sao kê giả lập                       | 10.B sao kê + khớp 3 tầng                                              |
| Danh sách giao dịch lệch & xử lý thủ công                | 10.B `reconciliation_exceptions`                                       |
| Đa tiền tệ, đa công ty, tích hợp thuế                    | 10.C                                                                   |
| Tiêu chí "timeout ≠ thất bại, phục hồi không tạo trùng"  | 10.B `unknown` + poll + cùng key; test #4, #5                          |

---

## 9. Rủi ro & câu hỏi cần chốt trước khi code

| Rủi ro                                  | Giảm thiểu                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Party/idempotency làm phình migration   | Thêm cột **nullable** trước, backfill sau; không sửa dữ liệu đã ghi sổ                          |
| Phân bổ sai làm công nợ lệch            | `AllocationService` thuần domain + unit test + khóa dòng khi phân bổ                            |
| Trạng thái thanh toán "kẹt" ở `unknown` | `payment-status-poll` có ngưỡng leo thang: sau N lần ⇒ thông báo + exception, không tự kết luận |
| Đối soát n-n gây khó hiểu               | Luôn lưu `amount` từng dòng khớp; báo cáo chỉ hiển thị dòng khớp chưa tất toán                  |
| Đa công ty là thay đổi xuyên suốt       | Làm cuối, một migration riêng, có test cách ly dữ liệu (test #12)                               |
| Thuế VN thay đổi theo luật              | `tax_codes` cấu hình được (bảng, không hardcode); chỉ làm GTGT cơ bản                           |

**Câu hỏi cần chốt** (ảnh hưởng đến schema, nên quyết trước 10.A):

1. **Tài khoản doanh thu/chi phí trên hóa đơn**: cho người dùng chọn theo dòng, hay mặc định theo
   `tax_codes`/cấu hình hệ thống?
   - Hệ thống ưu tiên cấu hình tài khoản theo loại hàng hóa/dịch vụ hoặc quy tắc kế toán; tax_codes cung cấp thông tin thuế. Người dùng có quyền chỉnh sửa tài khoản nếu được phân quyền.
2. **Giá vốn**: có theo dõi tồn kho (hàng hóa) ở 10.A không, hay chỉ hóa đơn dịch vụ (không tồn kho)?
   - Chỉ xử lý hóa đơn dịch vụ, không quản lý tồn kho
3. **Đơn vị tiền hạch toán**: VND cố định, hay cấu hình được (`companies.baseCurrency` ở 10.C)?
   - Hãy cấu hình và sẽ dịch sang VND
4. **Sao kê**: chỉ nhập file (CSV/JSON) như tài liệu gốc, hay cần kết nối ngân hàng thật (dịch vụ ngoài)?
   - Chuẩn hóa dữ liệu sao kê thành một mô hình giao dịch ngân hàng thống nhất. CSV/JSON và kết nối ngân hàng đều đưa dữ liệu vào cùng một pipeline xử lý.

---

## 10. Định nghĩa hoàn thành cho mục 10

- [ ] Mọi bút toán sinh từ chứng từ đều có `source_type`/`source_id` và **đúng một bút toán gốc**/chứng từ.
- [ ] Truy vết chạy **một mạch** báo cáo → chứng từ → bút toán → vết kiểm toán, qua API.
- [ ] Công nợ (tổng và theo đối tượng) **tái lập được từ `journal_lines`** và khớp `account_balances`.
- [ ] Kịch bản timeout/retry/kết quả đến trễ chạy end-to-end và **không sinh giao dịch trùng**.
- [ ] Danh sách lệch có quy trình xử lý thủ công, mọi hành động có vết.
- [ ] Test #1–#12 xanh; `pnpm lint` + `pnpm build` + `pnpm test` xanh cả hai app.
- [ ] `FUTURE_FEATURES.md` mục 10, `DEVELOPMENT_PLAN.md` mục 12, `AGENTS.md` (mục 8 API + giai đoạn 6)
      và bảng API được cập nhật khớp thực tế.

---

_Tài liệu liên quan: `DEVELOPMENT_PLAN.md` (roadmap & ERD lõi) · `Backend/FUTURE_FEATURES.md` (mục 1–10) ·
`../Mini ERP/Future-project.txt` · `../Payment & Reconciliation/Future-project.txt` · `../../../AGENTS.md`._
