# AGENTS.md — Hướng dẫn cho AI khi bắt đầu session

> **ĐỌC FILE NÀY TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ.**  
> Đây là "hợp đồng làm việc" giữa bạn (AI) và dự án. Mục tiêu: giữ cho mọi session  
> nhất quán, không phá vỡ môi trường, không vi phạm nghiệp vụ kế toán.

---

## 0. Trước khi bắt đầu — checklist bắt buộc

1. **Đọc memory dự án**: `D:\TC_KT\.workbuddy-ai\memory\` — đọc file `YYYY-MM-DD.md`  
   mới nhất, rồi `MEMORY.md` (nếu có). Đây là nhật ký các session trước.
2. **Đọc tài liệu dự án** khi cần ngữ cảnh:
   - `readme-details-project/Accounting Ledger/DEVELOPMENT_PLAN.md` — roadmap, ERD, invariants.
   - `readme-details-project/Accounting Ledger/Backend/FUTURE_FEATURES.md` — module sẽ làm.
   - `readme-details-project/*/Future-project.txt` và `Details-develop.txt`, `Stack-tecnical.txt`.
3. **Xác nhận trạng thái môi trường** (mục 4) trước khi chạy lệnh liên quan DB/Redis.
4. **Sau khi làm xong việc thực chất** → ghi lại vào `memory/YYYY-MM-DD.md` (append, không ghi đè).

---

## 1. Dự án là gì

**Accounting Ledger** — phần mềm tài chính kế toán (ghi sổ kế toán kép).  
Workspace: `D:\TC_KT`. Code dự án nằm ở `D:\TC_KT\readme-details-project\Accounting Ledger\`.

Ba dự án con trong roadmap (xem `readme-details-project/`):

1. **Accounting Ledger** (đang làm) — lõi sổ cái, bút toán, báo cáo tài chính.
2. **Mini ERP** (tương lai) — Customer/Vendor, hóa đơn, công nợ.
3. **Payment & Reconciliation** (tương lai) — thanh toán, đối soát ngân hàng.

---

## 2. Cấu trúc thư mục

```
D:\TC_KT\
├── AGENTS.md                      ← file này
├── .workbuddy-ai\memory\          ← nhật ký session (PHẢI đọc & cập nhật)
└── readme-details-project\
    ├── Details-develop.txt, Stack-tecnical.txt
    ├── Mini ERP\, Payment & Reconciliation\   (Future-project.txt)
    └── Accounting Ledger\
        ├── DEVELOPMENT_PLAN.md    ← kế hoạch phát triển đầy đủ
        ├── docker-compose.yml     ← postgres:16 + redis:7 (nếu dùng Docker)
        ├── package.json           ← script uỷ quyền: dev / dev:fe / dev:be / build / lint / test
        ├── Frontend\              ← Vite 8 + React 19 + TS + Tailwind v4 + shadcn/ui (SPA)
        │   ├── components.json    ← cấu hình shadcn (style new-york, alias @/)
        │   └── src\
        │       ├── index.css      ← Tailwind v4 + design token OKLCH (sáng/tối)
        │       ├── types\api.ts   ← type dùng chung (Role, AccountType, User, Account…)
        │       ├── lib\           ← api.ts (axios + refresh token), queryClient, format, utils (cn)
        │       ├── stores\        ← auth.store.ts (zustand + persist)
        │       ├── components\    ← Layout, ProtectedRoute, PageHeader, DataStates
        │       │   └── ui\        ← shadcn primitives (button, card, dialog, table, …)
        │       └── features\      ← auth | accounts | users | profile | dashboard | periods | journals | ledger | reports | audit | jobs (mục 9) | notifications | webhooks
        └── Backend\               ← NestJS 12 (ESM)
            ├── FUTURE_FEATURES.md
            ├── .env / .env.example
            ├── pnpm-workspace.yaml
            └── src\
                ├── common\        ← decorators, guards, enums (Role, AccountType, JournalStatus, FiscalPeriodStatus), services, utils (money, date)
                ├── users\         ← User, RefreshToken entities + CRUD (admin) + Profile
                ├── auth\          ← login/refresh/logout/me/change-password + JWT
                ├── accounts\      ← Chart of Accounts (cây tài khoản, CRUD)
                ├── ledger\        ← AccountBalance + LedgerService + LedgerQueryService (sổ cái, trial balance, đối chiếu)
                ├── fiscal-periods\← FiscalPeriod (open/lock/close) + kết chuyển số dư
                ├── journals\      ← JournalEntry, JournalLine (draft→approved→posted→reversed)
                ├── reports\       ← ReportsService (P&L, Balance Sheet, Cash Flow) + ReportExportService (xlsx/pdf)
                ├── audit\         ← AuditLog + AuditSubscriber (ghi vết tự động) + truy vết chứng từ
                ├── jobs\         ← Mục 9: job_runs/notifications/webhook_* + 4 processor BullMQ + jobs.scheduler (cron)
                ├── app.module.ts  ← wire ConfigModule/TypeORM/Schedule/BullMQ + APP_GUARD + APP_INTERCEPTOR
                ├── main.ts        ← prefix /api, CORS, ValidationPipe, Swagger /api/docs
                └── seed.ts        ← tạo admin đầu tiên (pnpm seed)
```

---

## 3. Tech stack

| Lớp             | Công nghệ                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend        | Vite 8, React 19, TypeScript, react-router-dom, axios, @tanstack/react-query, zustand, zod, dayjs, recharts                                                     |
| UI              | **Tailwind CSS v4** (`@tailwindcss/vite`, cấu hình CSS-first) + **shadcn/ui** (style new-york) trên Radix UI · lucide-react · sonner · class-variance-authority |
| Backend         | NestJS 12 (**ESM**), TypeORM + PostgreSQL, @nestjs/schedule (cron), @nestjs/bullmq + Redis, Swagger, Passport + JWT                                             |
| Bảo mật         | bcryptjs (KHÔNG dùng bcrypt), SHA-256 cho refresh token                                                                                                         |
| Số học tiền     | **decimal.js** + cột DB `NUMERIC(19,4)`                                                                                                                         |
| Package manager | **pnpm** (12.x)                                                                                                                                                 |
| Test            | Vitest (`pnpm test`) · Lint: oxlint (`pnpm lint`)                                                                                                               |

---


## 4. Môi trường — TRẠNG THÁI & BẪY (đọc kỹ)

**Trạng thái máy:**

- Node 22.22.2 · npm 10.9.7 · **pnpm 12.11.2** · git 2.55.
  - Node của user do **nvm** quản lý (symlink ở `C:\Program Files\nodejs`).
  - pnpm tồn tại ở **2 nơi**: bản của agent ở `C:\Users\Admin\.workbuddy-ai\binaries\node\versions\22.22.2-6\`,  
    và bản cho **terminal của user** ở `C:\Users\Admin\AppData\Roaming\npm\` (thư mục này mới nằm trong PATH thật của user).
  - ⚠️ Khi cài global cho user: `npm install -g <pkg> --prefix "C:/Users/Admin/AppData/Roaming/npm"`.  
    Nếu package có `preinstall`/`postinstall` thì **phải thêm `--allow-scripts=<pkg>`** — npm chặn script  
    mặc định, shim `.cmd` sinh ra sẽ trỏ sai và lệnh không chạy được.
- **Redis: ĐÃ cài & đang chạy** ở `127.0.0.1:6379` (`C:\Program Files\Redis\`).
- **PostgreSQL: ĐÃ cài & đang chạy** — **hai bản**: 17 và 18, đều ở `C:\Program Files\PostgreSQL\`.
  - Port 5432 đang do **PostgreSQL 17.11** phục vụ. Client: `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
  - User `postgres` / mật khẩu **`postgres`** (khớp `.env` và `docker-compose.yml`) — **đã xác nhận chạy được**.
  - DB `accounting_ledger` **đã được tạo** (session 6). Schema do TypeORM `synchronize` tạo khi  
    `NODE_ENV != production` — bảng: `users`, `refresh_tokens`, `accounts`, `fiscal_periods`,  
    `journal_entries`, `journal_lines`, `account_balances`.
  - Lệnh nhanh: `PGPASSWORD=postgres "/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -U postgres -d accounting_ledger -c "\dt"`.
  - ⚠️ Khi production phải **tắt `synchronize`** và chuyển sang migration.
- **Docker: CHƯA cài** → `docker-compose.yml` chỉ dùng khi người dùng cài Docker (không cần thiết vì  
  PostgreSQL + Redis đã chạy sẵn trên máy).
- **FE chạy được KHÔNG cần DB**: có mock backend ở `D:\TC_KT\.tmp\` (`mock-server.mjs` +  
  `mock-accounts.json`, `mock-tree.json`, `mock-users.json`). Cách dùng: chạy  
  `node mock-server.mjs` (listen `127.0.0.1:3000`) rồi `pnpm dev` trong `Frontend/` —  
  Vite proxy `/api` sẽ trỏ vào mock. Dùng khi không muốn bật PostgreSQL.

**Bẫy môi trường (rút ra từ các session trước — ĐỪNG lặp lại sai lầm):**

1. **pnpm store/cache phải ở ổ D**: `D:/.pnpm-store`, `D:/.pnpm-cache`. Store ở C: làm dlx/install fail.
2. **KHÔNG rename folder chứa `node_modules` của pnpm** — symlink dùng absolute path, rename sẽ  
   làm hỏng toàn bộ node_modules (phải `rm -rf node_modules && pnpm install` để sửa).  
   Muốn đổi case trên Windows: `cmd //c "ren old New"`.
3. **Sandbox có thể "nuốt" symlink** của `pnpm add`/`pnpm install` → package mới add xong  
   có thể không thực sự xuất hiện trong `node_modules` (dù đã có trong `.pnpm` store).  
   Cách xử lý thường: `rm -rf node_modules && pnpm install` (chạy ngoài sandbox nếu được).
   - ⚠️ `rm -rf node_modules` có thể **bị chặn** (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`).  
     Khi đó **không** cần xóa — dùng `pnpm install --force` trước; nếu vẫn thiếu junction,  
     chạy script `D:\TC_KT\.tmp\fix-pnpm-links.mjs` để **tái tạo junction còn thiếu** từ store  
     (index store theo semver rồi link top-level + closure). Script này đã sửa được  
     `exceljs` + `pdfkit` mà không cần `rm -rf`.
   - → **Sau mỗi lần `pnpm add`, kiểm tra lại `node_modules` trước khi build.**
4. **pnpm 12 `ERR_PNPM_IGNORED_BUILDS`**: khai báo trong `pnpm-workspace.yaml` là KHÔNG đủ.  
   Phải chạy machine-level: `pnpm approve-builds '!@scarf/scarf' '!msgpackr-extract'`.  
   (Repo đã deny 2 build script optional này rồi.)
5. **Backend là ESM**: `"type": "module"` → mọi import **nội bộ phải có đuôi `.js`**  
   (vd: `import { X } from './x.service.js'`). Quên đuôi → lỗi runtime.
6. **`bcrypt` cần native build → dùng `bcryptjs`** (đã thay). Tương tự, ưu tiên thư viện pure-JS  
   trên Windows để tránh lỗi build native.
7. **Tailwind v4 KHÔNG có `tailwind.config.js`**: cấu hình nằm ngay trong `src/index.css`  
   (`@import 'tailwindcss'` + `@theme inline`). **ĐỪNG tạo file config kiểu v3** — sẽ bị bỏ qua.
8. **shadcn export cả component lẫn variants** (vd `buttonVariants`) → oxlint báo  
   `react(only-export-components)`. Đã xử lý bằng comment `// oxlint-disable-next-line ...`  
   ngay trên dòng `export { ... }`. **ĐỪNG xóa comment đó** nếu không muốn lint fail.
9. **`D:\package.json` KHÔNG phải dự án này** — đó là project khác tên `waiting_list`  
   (Next.js 15 + antd + redux). Khi pnpm/npm **không thấy `package.json` ở thư mục hiện tại,  
   nó sẽ đi ngược lên các cấp cha** → chạm `D:\package.json` → chạy nhầm script `dev`  
   của nó (`next dev --turbopack --port 2528`) và kéo về ~90 package không liên quan  
   (antd, webpack-dev-server, react-icons…). Biểu hiện: `pnpm dev` "không chạy" / treo ở  
   bước download.  
   → **Luôn chạy trong `Frontend/` hoặc `Backend/`.** Gốc `Accounting Ledger/` đã có  
   `package.json` uỷ quyền (chặn không cho lọt lên `D:\`), nhưng **đừng bao giờ chạy pnpm ở `D:\TC_KT\`**  
   (chỗ đó vẫn sẽ lọt lên `D:\`).
10. **`decimal.js` trong ESM — phải dùng named import**:  
    `import Decimal from 'decimal.js'` sẽ trỏ vào **namespace**, gây lỗi  
    `Cannot use namespace 'Decimal' as a type` / `not constructable`.  
    → Luôn viết `import { Decimal } from 'decimal.js'`; nếu chỉ cần kiểu thì `import type { Decimal }`.
11. **Vòng lặp import ESM + `emitDecoratorMetadata` = crash lúc chạy (build vẫn xanh!)**.  
    Khi 2 entity tham chiếu vòng qua nhau (`JournalEntry` ↔ `JournalLine`), decorator  
    `@ManyToOne(() => X)` / `@OneToMany(() => Y)` sinh `design:type` **đánh giá class ngay  
    lúc nạp module** → `ReferenceError: Cannot access 'X' before initialization`.  
    Đây là lỗi **runtime**, `nest build` và `tsc` **không** phát hiện được.  
    → Phía "nhiều" (inverse side) khai báo **tên entity dạng chuỗi**:  
    `@OneToMany('JournalLine', (line: JournalLine) => line.entry)` + `import type { JournalLine }`  
    (xóa hẳn cạnh import runtime). Sau khi sửa entity, **phải chạy thật `node dist/main.js`**  
    để chắc chắn không còn lỗi này.
12. **Postgres trả cột `numeric` về dạng `string`** — đừng so sánh với `number`. DTO nhận tiền  
    cũng validate bằng `MONEY_PATTERN` (chuỗi), rồi mới đổi sang `Decimal`. Tiền luôn được  
    chuẩn hóa 4 chữ số thập phân (`'0'` → `'0.0000'`) khi so sánh trong test.
13. **`lock` không dùng chung được với `relations`** trong Postgres `FOR UPDATE` (quan hệ 1-n  
    phía nullable) → phải `findOne({ lock })` rồi query quan hệ ở câu thứ hai (xem  
    `JournalsService.lockEntryWithLines`).
14. **`pdfkit` + tiếng Việt**: font chuẩn (Helvetica…) **không** có dấu tiếng Việt → phải  
    `doc.registerFont()` với **file TTF Unicode** rồi `doc.font()`. `ReportExportService`  
    tự dò font: biến môi trường `PDF_FONT_PATH` → `C:/Windows/Fonts/arial.ttf` → các ứng viên  
    khác. Kiểm chứng: PDF chứa `/FontFile2` + `/ToUnicode` thì dấu mới hiển thị đúng.  
    `exceljs` thì thuần JS, không cần font.

---

## 5. Bất biến nghiệp vụ kế toán (KHÔNG được vi phạm)

Đây là "luật" của phần mềm kế toán — vi phạm = dữ liệu sai, không cứu được.

1. **Cân bằng kép**: mỗi bút toán Σ Nợ = Σ Có. **Kiểm tra ở backend, không tin frontend.**
2. **Append-only**: bút toán đã ghi sổ **KHÔNG được sửa/xóa**. Sai thì tạo **bút toán đảo**  
   (reversing entry), giữ nguyên lịch sử.
3. **Khóa kỳ kế toán**: `locked` và `closed` đều **đóng băng toàn bộ** — chặn tạo nháp, sửa, xóa,  
   ghi sổ, đảo. Khác biệt duy nhất: `locked` mở lại được, `closed` thì không (và đã kết chuyển số dư).
4. **Chỉ ghi vào tài khoản lá** (`is_postable = true`), không ghi vào tài khoản cha.
5. **Tiền tệ**: dùng `NUMERIC(19,4)` trong DB + `decimal.js` trong code.  
   **TUYỆT ĐỐI KHÔNG dùng `number`/float cho số tiền.**
6. **Idempotency**: dùng idempotency key chống ghi trùng; khóa đồng thời (optimistic/pessimistic lock)  
   khi cập nhật số dư.
7. **Ghi sổ trong 1 transaction**: tạo nháp → xác nhận → ghi sổ phải nguyên tử.
8. **Audit**: mọi thay đổi phải có audit log (before/after, actor, thời điểm).
9. **Số dư là số dư THUẦN**: `(Nợ đầu kỳ − Có đầu kỳ) + (Nợ phát sinh − Có phát sinh)`.  
   **Không** cộng riêng cột Nợ và cột Có rồi coi là số dư — tài khoản bị đảo (Nợ = Có)  
   phải triệt tiêu về 0. Số dư âm trình bày ở cột "dư Có".

---

## 6. Quy ước code (Backend NestJS)

- **Cấu trúc module**: mỗi domain 1 folder `src/<domain>/` gồm `entities/`, `dto/`,  
  `<domain>.service.ts`, `<domain>.controller.ts`, `<domain>.module.ts`.
- **DTO + validation**: dùng `class-validator` + `class-transformer`; `ValidationPipe` đã bật global.
- **Xác thực/phân quyền**: guard gắn **global** qua `APP_GUARD` trong `app.module.ts`  
  — **thứ tự quan trọng**: `JwtAuthGuard` TRƯỚC `RolesGuard`.
  - Route công khai → `@Public()`.
  - Giới hạn vai trò → `@Roles(Role.Admin, ...)`.
  - Lấy user hiện tại → `@CurrentUser()`.
- **Vai trò (RBAC)**: `admin` / `maker` (lập) / `checker` (duyệt) / `poster` (ghi sổ).
- **Bảo mật**: `passwordHash` để `select: false`; refresh token chỉ lưu **SHA-256 hash**;  
  login trả **cùng một thông báo lỗi** dù sai email hay mật khẩu (chống dò tài khoản);  
  refresh token có **rotation** (thu hồi ngay khi dùng); đổi mật khẩu thu hồi toàn bộ refresh token.
- **Comment/đặt tên**: theo phong cách hiện có trong repo; giữ tiếng Việt cho mô tả nghiệp vụ.

### Frontend (Vite + React 19 + TS)

- **TS config nghiêm ngặt**: `verbatimModuleSyntax` (import type phải ghi `import type`),  
  `erasableSyntaxOnly` (**KHÔNG dùng `enum`** — dùng union type + const object),  
  `noUnusedLocals`/`noUnusedParameters`.
- **Gọi API**: mọi request đi qua `src/lib/api.ts` (axios baseURL `/api`). Dev dùng **proxy  
  của Vite** (`vite.config.ts`) trỏ `/api` → `http://localhost:3000` nên không vướng CORS.  
  Interceptor tự gắn Bearer token và **tự refresh khi 401** (single-flight, xong thì retry).
- **Phiên đăng nhập**: `zustand` + `persist` ở `src/stores/auth.store.ts` (key `al-auth`).
- **Dữ liệu**: `@tanstack/react-query`; query key theo feature (`['accounts']`, `['users']`,  
  `['profile']`). Sau mutation → `invalidateQueries` theo prefix.
- **Bảo vệ route**: `ProtectedRoute` (không token → `/login`; thiếu vai trò → `/`).  
  Chỉ `admin` thấy menu **Người dùng**.
- **Không setState trong `useEffect`** (rule lint `react(set-state-in-effect)`): để form  
  nhận giá trị khởi tạo, cha truyền `key` thay đổi khi mở modal → component remount.
- **UI = Tailwind v4 + shadcn/ui** (KHÔNG viết CSS thuần, KHÔNG thêm UI lib khác):
  - Token màu khai báo trong `src/index.css` (`:root` / `.dark`, hệ OKLCH) + `@theme inline`.  
    Muốn thêm màu/bo góc → sửa token, **KHÔNG hardcode mã màu** trong component.
  - Primitive có sẵn ở `src/components/ui/`: `button`, `card`, `input`, `textarea`, `label`,  
    `select`, `checkbox`, `dialog`, `table`, `tabs`, `badge`, `avatar`, `separator`,  
    `skeleton`, `alert`, `dropdown-menu`, `sonner`, `sidebar`, `sheet`, `tooltip`, `popover`,  
    `calendar`, `date-picker`, `data-table`. Cần thêm → tạo file mới trong thư mục đó  
    theo đúng chuẩn shadcn (giữ nguyên cấu trúc `cva` + `data-slot`).
  - **Bảng danh sách dùng `DataTable`** (`@/components/ui/data-table`) — TanStack Table v8,  
    `pageSize` mặc định **10**, chân bảng có dãy nút số trang + chọn số dòng/trang. Đừng tự  
    viết lại `<Table>` cho các trang danh sách; bảng báo cáo/trial balance thì vẫn dùng `<Table>`.
  - **Mọi ô chọn ngày dùng `DatePicker`** (`@/components/ui/date-picker`, Popover + `Calendar`  
    của shadcn, locale `vi`). **KHÔNG** dùng `<input type="date">` — giá trị vào/ra luôn là  
    chuỗi `YYYY-MM-DD` (dùng `formatDateInput` khi cần).
  - **Sidebar** là component shadcn (`SidebarProvider` + `Sidebar collapsible="icon"` +  
    `SidebarInset`) trong `Layout.tsx`; menu khai báo theo nhóm ở `NAV_GROUPS`, mục `adminOnly`  
    tự ẩn với người dùng không phải admin.
  - Ghép class bằng `cn()` (`@/lib/utils` = clsx + tailwind-merge); biến thể bằng `cva`.
  - Icon dùng `lucide-react`; thông báo dùng `toast` của `sonner` (`<Toaster />` đã gắn ở `App.tsx`).
  - Alias `@/` → `src/` (khai báo ở `vite.config.ts` + `tsconfig.app.json`), KHÔNG viết  
    đường dẫn tương đối kiểu `../../../`.
- **Chia nhỏ bundle**: mỗi trang là 1 route lazy (`React.lazy` + `Suspense` trong `App.tsx`).  
  Thêm trang mới → thêm 1 dòng lazy, **KHÔNG import trực tiếp** để tránh phình chunk chính.

---

## 7. Lệnh thường dùng

Chạy trong `Backend/` (hoặc `Frontend/`):

```bash
pnpm install          # cài deps (nhớ: sau pnpm add → rm -rf node_modules && pnpm install)
pnpm build            # build
pnpm lint             # oxlint
pnpm test             # vitest run
pnpm start:dev        # chạy dev (watch)
pnpm seed             # tạo admin đầu tiên (đọc ADMIN_EMAIL/ADMIN_PASSWORD trong .env)
pnpm start:prod       # chạy bản build
```

Chạy ở gốc `Accounting Ledger/` (uỷ quyền sang 2 app con):

```bash
pnpm dev              # = Frontend dev server (Vite, cổng 5173)
pnpm dev:fe           # Frontend dev server
pnpm dev:be           # Backend watch mode (NestJS, cổng 3000)
pnpm build            # build cả Frontend + Backend
pnpm lint             # lint cả hai
pnpm test             # test Backend
pnpm seed             # tạo admin đầu tiên
```

Khởi động hạ tầng (nếu có Docker): `docker compose up -d` trong `Accounting Ledger/`.

Sau khi chạy: API tại `http://localhost:3000/api`, Swagger tại `http://localhost:3000/api/docs`,  
Frontend (Vite) tại `http://localhost:5173`.

Riêng `Frontend/`: `pnpm dev` (dev server), `pnpm build` (`tsc -b && vite build`), `pnpm lint` (oxlint).

> Lưu ý production: SPA dùng `BrowserRouter` nên máy chủ tĩnh phải có fallback về `index.html`  
> cho các route con (`/accounts`, `/users`, `/profile`).

---

## 8. API đã có

**Auth** (`/api/auth`) — `login`, `refresh`, `logout`, `me`, `change-password`.

**Users** (`/api/users`, chỉ **admin**) — `GET` list, `POST` create, `GET/:id`,  
`PATCH/:id` (hồ sơ/vai trò/trạng thái), `POST /:id/reset-password` (thu hồi mọi phiên).

**Profile** (`/api/profile`) — `GET` hồ sơ của tôi, `PATCH` cập nhật họ tên/ảnh đại diện.

**Accounts** (`/api/accounts`, Chart of Accounts):

| Method | Route                | Quyền                                            |
| ------ | -------------------- | ------------------------------------------------ |
| GET    | `/api/accounts`      | đã đăng nhập (lọc type/isActive/search/parentId) |
| GET    | `/api/accounts/tree` | đã đăng nhập                                     |
| GET    | `/api/accounts/:id`  | đã đăng nhập                                     |
| POST   | `/api/accounts`      | **admin**                                        |
| PATCH  | `/api/accounts/:id`  | **admin**                                        |
| DELETE | `/api/accounts/:id`  | **admin** (chỉ tài khoản lá)                     |

**Fiscal Periods** (`/api/fiscal-periods`, mục 4 — vòng đời `open → locked → closed`):

| Method | Route                              | Quyền             | Ghi chú                                     |
| ------ | ---------------------------------- | ----------------- | ------------------------------------------- |
| GET    | `/api/fiscal-periods`              | đã đăng nhập      | lọc `status` / `year` / `date` / `search`   |
| GET    | `/api/fiscal-periods/:id`          | đã đăng nhập      |                                             |
| GET    | `/api/fiscal-periods/:id/balances` | đã đăng nhập      | số dư đầu kỳ / phát sinh / cuối kỳ          |
| POST   | `/api/fiscal-periods`              | **admin, poster** | mã duy nhất, không chồng lấn                |
| PATCH  | `/api/fiscal-periods/:id`          | **admin, poster** | chỉ khi kỳ đang mở                          |
| DELETE | `/api/fiscal-periods/:id`          | **admin**         | chỉ khi kỳ mở & chưa có bút toán            |
| POST   | `/api/fiscal-periods/:id/open`     | **admin, poster** | mở lại kỳ tạm khóa (**200**)                |
| POST   | `/api/fiscal-periods/:id/lock`     | **admin, poster** | đóng băng, còn mở lại được (**200**)        |
| POST   | `/api/fiscal-periods/:id/close`    | **admin, poster** | chốt vĩnh viễn + kết chuyển số dư (**200**) |

**Journals** (`/api/journals`, mục 5 — vòng đời `draft → approved → posted → reversed`):

| Method | Route                       | Quyền              | Ghi chú                                                                                       |
| ------ | --------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| GET    | `/api/journals`             | đã đăng nhập       | lọc `status`/`periodId`/`accountId`/`fromDate`/`toDate`/`search`, phân trang `limit`/`offset` |
| GET    | `/api/journals/:id`         | đã đăng nhập       | kèm dòng định khoản + tài khoản                                                               |
| POST   | `/api/journals`             | **admin, maker**   | tạo nháp; nhận `idempotencyKey` (**201**)                                                     |
| PATCH  | `/api/journals/:id`         | **admin, maker**   | chỉ bút toán nháp, kỳ phải đang mở                                                            |
| DELETE | `/api/journals/:id`         | **admin, maker**   | chỉ bút toán nháp (**204**)                                                                   |
| POST   | `/api/journals/:id/approve` | **admin, checker** | nháp → đã xác nhận (**200**)                                                                  |
| POST   | `/api/journals/:id/post`    | **admin, poster**  | cấp số hiệu + cập nhật số dư, **idempotent** (**200**)                                        |
| POST   | `/api/journals/:id/reverse` | **admin, poster**  | tạo bút toán đảo, gốc → `reversed` (**201**)                                                  |

> Quy ước mã HTTP: endpoint **chuyển trạng thái** (open/lock/close/approve/post) trả **200**;  
> endpoint **tạo mới tài nguyên** (POST /journals, POST /:id/reverse) trả **201**.  
> `DELETE` trả **204**.

**Ledger** (`/api/ledger`, mục 6 — sổ cái & số dư, đọc từ `journal_lines` POSTED+REVERSED):

| Method | Route                        | Quyền        | Ghi chú                                                                                                                                                            |
| ------ | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/ledger/general-ledger` | đã đăng nhập | bắt buộc `accountId`; phạm vi theo `periodId` **hoặc** `fromDate`+`toDate`; trả số dư đầu → dòng phát sinh (kèm số dư lũy kế) → số dư cuối; `limit`≤2000, `offset` |
| GET    | `/api/ledger/trial-balance`  | đã đăng nhập | phạm vi theo `periodId` **hoặc** `fromDate`+`toDate`; mọi tài khoản + tổng + cờ `balanced`                                                                         |
| GET    | `/api/ledger/reconciliation` | đã đăng nhập | bắt buộc `periodId`; so `account_balances` đã lưu với số dư tái lập từ bút toán → `consistent` + `differences[]`                                                   |

**Reports** (`/api/reports`, mục 7 — báo cáo tài chính):

| Method | Route                          | Quyền        | Ghi chú                                                                                                            |
| ------ | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/reports/profit-and-loss` | đã đăng nhập | `periodId` hoặc `fromDate`+`toDate`; doanh thu/chi phí/lợi nhuận thuần + biên LN                                   |
| GET    | `/api/reports/balance-sheet`   | đã đăng nhập | `toDate` = ngày lập báo cáo; TS = NPT + VCSH + LN giữ lại, cờ `balanced`                                           |
| GET    | `/api/reports/cash-flow`       | đã đăng nhập | phương pháp trực tiếp; 3 nhóm HĐKD/HĐĐT/HĐTC                                                                       |
| GET    | `/api/reports/export/:kind`    | đã đăng nhập | `kind` = `profit-and-loss` | `balance-sheet` | `cash-flow`; `format` = `xlsx` | `pdf`; trả file (`StreamableFile`) |

**Audit** (`/api/audit-logs`, mục 8 — chỉ **admin**):

| Method | Route                                              | Quyền     | Ghi chú                                                                                        |
| ------ | -------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/audit-logs`                                  | **admin** | lọc `entity`/`entityId`/`actorId`/`action`/`fromDate`/`toDate`/`search`; `limit`≤500, `offset` |
| GET    | `/api/audit-logs/trace/:entity/:entityId`          | **admin** | lịch sử thay đổi của một bản ghi (cũ → mới)                                                    |
| GET    | `/api/audit-logs/traceability/journal-entries/:id` | **admin** | truy vết bút toán → dòng → chứng từ nguồn → vết                                                |
| GET    | `/api/audit-logs/:id`                              | **admin** | chi tiết một vết                                                                               |

> Vết kiểm toán được ghi **tự động** bằng TypeORM entity subscriber (`AuditSubscriber`) trong **cùng  
> transaction** với thao tác nghiệp vụ; danh tính lấy từ `AsyncLocalStorage` (`AuditContextInterceptor`).  
> Bảng loại trừ: `audit_logs`, `account_balances`, `refresh_tokens`.

**Jobs** (`/api/jobs`, mục 9 — xử lý bất đồng bộ: hàng đợi BullMQ + cron):

| Method | Route                             | Quyền             | Ghi chú                                                                                        |
| ------ | --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/jobs/overview`              | đã đăng nhập      | số đếm hàng đợi (Redis) + số lượt chạy theo trạng thái + cron có bật không                     |
| GET    | `/api/jobs/queues`                | đã đăng nhập      | số job waiting/active/completed/failed/delayed của 4 hàng đợi                                  |
| GET    | `/api/jobs/schedules`             | đã đăng nhập      | danh mục cron + lần chạy gần nhất/kế tiếp                                                      |
| POST   | `/api/jobs/schedules/:name/trigger` | **admin, poster** | chạy ngay một lịch (**201**)                                                                    |
| GET    | `/api/jobs/runs`                  | đã đăng nhập      | lọc `queue`/`status`/`trigger`/`jobName`/`triggeredBy`; `limit`≤200, `offset`                   |
| GET    | `/api/jobs/runs/:id`              | đã đăng nhập      | chi tiết lượt chạy (payload, kết quả, lỗi)                                                      |
| POST   | `/api/jobs/runs/:id/retry`        | **admin, poster** | thử lại job **đã thất bại**, xếp lượt mới từ payload đã lưu (**201**)                           |
| GET    | `/api/jobs/runs/:id/download`     | đã đăng nhập      | tải file báo cáo do job sinh ra (`StreamableFile`)                                              |
| POST   | `/api/jobs/reports`               | đã đăng nhập      | xếp job sinh báo cáo nền (`kind`, `format?`, theo `periodId` hoặc `fromDate`/`toDate`) (**201**) |
| POST   | `/api/jobs/integrity-checks`      | **admin**         | chạy 7 kiểm tra bất biến ngay (**201**)                                                         |
| POST   | `/api/jobs/balance-snapshot`      | **admin, poster** | chốt/đối chiếu số dư một kỳ; `repair=true` mới ghi lại số dư (**201**)                          |

> Mọi lượt chạy ghi vào **`job_runs`**; `jobId` của BullMQ = id dòng này (riêng webhook là id
> dòng giao) nên trạng thái bền qua restart. Bảng vận hành (`job_runs`, `notifications`,
> `webhook_deliveries`, `webhook_events`) **không** ghi vết kiểm toán — chúng đã là nhật ký.

**Notifications** (`/api/notifications`, mục 9 — đầu ra của job nền):

| Method | Route                            | Quyền        | Ghi chú                                                        |
| ------ | -------------------------------- | ------------ | -------------------------------------------------------------- |
| GET    | `/api/notifications`             | đã đăng nhập | lọc `type`/`status`/`severity`/`search`; lọc theo người nhận + vai trò |
| GET    | `/api/notifications/unread-count` | đã đăng nhập | số chưa đọc (badge)                                            |
| POST   | `/api/notifications/read-all`    | đã đăng nhập | đánh dấu đã đọc mọi thông báo nhìn thấy được                    |
| POST   | `/api/notifications/:id/read`    | đã đăng nhập | đánh dấu một thông báo đã đọc                                   |

**Webhooks** (`/api/webhooks`, mục 9 — chỉ **admin**, trừ route `inbound` là public+HMAC):

| Method | Route                                    | Quyền  | Ghi chú                                                                     |
| ------ | ---------------------------------------- | ------ | --------------------------------------------------------------------------- |
| GET    | `/api/webhooks/endpoints`                | admin  | danh sách endpoint (không bao giờ trả `secret`)                             |
| POST   | `/api/webhooks/endpoints`                | admin  | đăng ký endpoint; bỏ trống `secret` ⇒ tự sinh (**201**)                      |
| GET    | `/api/webhooks/endpoints/:id`            | admin  | chi tiết endpoint                                                            |
| PATCH  | `/api/webhooks/endpoints/:id`            | admin  | đổi URL/sự kiện/bật-tắt/khóa ký                                             |
| DELETE | `/api/webhooks/endpoints/:id`            | admin  | xóa endpoint, **giữ lại** nhật ký giao (**204**)                            |
| GET    | `/api/webhooks/deliveries`               | admin  | nhật ký giao, lọc `endpointId`/`status`                                      |
| POST   | `/api/webhooks/deliveries/:id/retry`     | admin  | thử lại một lần giao đã thất bại                                            |
| POST   | `/api/webhooks/events`                   | admin  | phát một sự kiện ra endpoint đăng ký (chống giao trùng) (**201**)            |
| GET    | `/api/webhooks/events`                   | admin  | webhook nhận vào, kèm `processed`/`duplicate`/`late`/`rejected`             |
| GET    | `/api/webhooks/stats`                    | admin  | thống kê nhanh                                                              |
| POST   | `/api/webhooks/inbound`                  | Public | nhận webhook ngoài: **idempotent** theo `id`, phát hiện **kết quả đến trễ**; sai chữ ký ⇒ **401** |

> Chữ ký: `sha256=<hex>` của HMAC-SHA256(raw body, secret). Biến môi trường mục 9:
> `JOBS_SCHEDULER_ENABLED` (mặc định `true`), `REPORT_STORAGE_DIR` (mặc định `./storage/reports`),
> `WEBHOOK_INBOUND_SECRET` (bỏ trống = không kiểm tra chữ ký, chỉ dùng khi dev).

**Health** — `GET /api/health` (public).

---

## 9. Lộ trình (tóm tắt — chi tiết ở `DEVELOPMENT_PLAN.md`)

- **Giai đoạn 1**: FiscalPeriod, Journal, JournalLine, AccountBalance, AuditLog
  - constraint cân bằng Nợ/Có + migration + seed demo.  
    ✅ Account/Chart of Accounts, FiscalPeriod, Journal/JournalLine, AccountBalance **đã xong**  
    (mục 4, 5, 6 API — xem mục 8). ✅ `AuditLog` (mục 8) **đã xong** — ghi vết tự động qua entity  
    subscriber. ⏳ còn migration + seed demo.
- **Giai đoạn 2**: ✅ Journal workflow (nháp→xác nhận→ghi sổ), reversing entry, idempotency.
- **Giai đoạn 3**: ✅ Sổ cái, số dư, **Trial Balance**, **đối chiếu tái lập số dư** (mục 6).
- **Giai đoạn 4**: ✅ Báo cáo tài chính (P\&L, Balance Sheet, Cash Flow) + xuất Excel/PDF (mục 7).
- **Giai đoạn 4 (FE)**: ✅ đã gắn UI cho API mục 1–3 — trang Đăng nhập, Tổng quan,  
  Tài khoản kế toán (cây + bảng + CRUD), Người dùng (admin), Hồ sơ (đổi mật khẩu).  
  ✅ đã chuẩn hóa toàn bộ UI bằng **Tailwind v4 + shadcn/ui** (xem mục 3 & 6).  
  ✅ đã gắn UI cho API mục 4 & 5 — màn hình **bút toán** (danh sách/chi tiết/đảo) và  
  **kỳ kế toán** (danh sách + số dư kỳ).  
  ⏳ còn lại: màn hình **sổ cái**, **báo cáo** (Recharts) — API mục 6 & 7 đã sẵn sàng, chưa gắn UI.
- **Giai đoạn 5**: ✅ **Queue + Schedule (mục 9)** — 4 hàng đợi BullMQ (reports/maintenance/
  notifications/webhooks) + 4 lịch cron (chốt số dư, kiểm tra bất biến, nhắc công nợ, quét
  webhook treo), lịch sử `job_runs` có thử lại, thông báo trong hệ thống, webhook có retry +
  xử lý kết quả đến trễ; ✅ audit log (mục 8). ⏳ dead-letter queue, gửi email/SMS.
- **Giai đoạn 6**: Mở rộng — Mini ERP, Payment & Reconciliation, đa tiền tệ.

---

## 10. Quy tắc làm việc của AI

- **Sửa code thì phải verify**: sau khi đổi code chạy `pnpm build` + `pnpm test` (+ `pnpm lint`).  
  Không tuyên bố "xong" nếu chưa build/test pass.
- **Đổi entity / quan hệ TypeORM → phải chạy thật**: `node dist/main.js` và kiểm tra API thật  
  (bẫy #11 là lỗi runtime, build xanh vẫn crash). Nếu có DB thì chạy `pnpm seed` rồi gọi API  
  để chắc chắn schema + luồng nghiệp vụ hoạt động.
- **Sửa hành vi API → cập nhật bảng ở mục 8** (route, quyền, mã HTTP) cho khớp.
- **Không đoán bí mật** (mật khẩu DB, secret). Thiếu thì **hỏi người dùng**.
- **Không phá môi trường**: tuân thủ mục 4. Không tự ý cài/xóa thứ ngoài phạm vi yêu cầu.
- **Không hardcode secret** vào code; đưa vào `.env` và cập nhật `.env.example` tương ứng.
- **Cập nhật tài liệu** khi thêm module: `FUTURE_FEATURES.md` (đánh dấu ✅/🟡/⏳) và file này nếu cần.
- **Ghi memory** sau khi hoàn thành việc thực chất (append vào `memory/YYYY-MM-DD.md`).
- **Ngôn ngữ trả lời**: tiếng Việt (trừ khi người dùng yêu cầu khác).

---

*Cập nhật file này mỗi khi có quyết định kỹ thuật mới hoặc phát hiện bẫy môi trường mới.*
