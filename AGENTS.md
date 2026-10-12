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
        ├── Frontend\              ← Vite 8 + React 19 + TS
        └── Backend\               ← NestJS 12 (ESM)
            ├── FUTURE_FEATURES.md
            ├── .env / .env.example
            ├── pnpm-workspace.yaml
            └── src\
                ├── common\        ← decorators, guards, enums, services, utils
                ├── users\         ← User, RefreshToken entities + CRUD (admin)
                ├── auth\          ← login/refresh/logout/me/change-password + JWT
                ├── app.module.ts  ← wire ConfigModule/TypeORM/Schedule/BullMQ + APP_GUARD
                ├── main.ts        ← prefix /api, CORS, ValidationPipe, Swagger /api/docs
                └── seed.ts        ← tạo admin đầu tiên (pnpm seed)
```

---

## 3. Tech stack

| Lớp | Công nghệ |
|---|---|
| Frontend | Vite 8, React 19, TypeScript, react-router-dom, axios, @tanstack/react-query, zustand, zod, dayjs, recharts |
| Backend | NestJS 12 (**ESM**), TypeORM + PostgreSQL, @nestjs/schedule (cron), @nestjs/bullmq + Redis, Swagger, Passport + JWT |
| Bảo mật | bcryptjs (KHÔNG dùng bcrypt), SHA-256 cho refresh token |
| Số học tiền | **decimal.js** + cột DB `NUMERIC(19,4)` |
| Package manager | **pnpm** (12.x) |
| Test | Vitest (`pnpm test`) · Lint: oxlint (`pnpm lint`) |

---

## 4. Môi trường — TRẠNG THÁI & BẪY (đọc kỹ)

**Trạng thái máy:**
- Node 22.22.2 · npm 10.9.7 · **pnpm 12.11.2** (cài global) · git 2.55.
- **Redis: ĐÃ cài & đang chạy** ở `127.0.0.1:6379` (`C:\Program Files\Redis\`).
- **PostgreSQL 18: ĐÃ cài & đang chạy** tại `C:\Program Files\PostgreSQL\18` (service, port 5432, auth `scram-sha-256`).
  - ⚠️ **Chưa biết mật khẩu user `postgres`** → nếu cần chạy DB thật, **hỏi người dùng** mật khẩu, đừng đoán.
  - DB cần tạo: `accounting_ledger`.
- **Docker: CHƯA cài** → `docker-compose.yml` chỉ dùng khi người dùng cài Docker.

**Bẫy môi trường (rút ra từ các session trước — ĐỪNG lặp lại sai lầm):**
1. **pnpm store/cache phải ở ổ D**: `D:/.pnpm-store`, `D:/.pnpm-cache`. Store ở C: làm dlx/install fail.
2. **KHÔNG rename folder chứa `node_modules` của pnpm** — symlink dùng absolute path, rename sẽ
   làm hỏng toàn bộ node_modules (phải `rm -rf node_modules && pnpm install` để sửa).
   Muốn đổi case trên Windows: `cmd //c "ren old New"`.
3. **Sandbox có thể "nuốt" symlink** của `pnpm add`/`pnpm install` → package mới add xong
   có thể không thực sự xuất hiện trong `node_modules`. Cách xử lý:
   `rm -rf node_modules && pnpm install` (chạy ngoài sandbox nếu được).
   → **Sau mỗi lần `pnpm add`, kiểm tra lại `node_modules` trước khi build.**
4. **pnpm 12 `ERR_PNPM_IGNORED_BUILDS`**: khai báo trong `pnpm-workspace.yaml` là KHÔNG đủ.
   Phải chạy machine-level: `pnpm approve-builds '!@scarf/scarf' '!msgpackr-extract'`.
   (Repo đã deny 2 build script optional này rồi.)
5. **Backend là ESM**: `"type": "module"` → mọi import **nội bộ phải có đuôi `.js`**
   (vd: `import { X } from './x.service.js'`). Quên đuôi → lỗi runtime.
6. **`bcrypt` cần native build → dùng `bcryptjs`** (đã thay). Tương tự, ưu tiên thư viện pure-JS
   trên Windows để tránh lỗi build native.

---

## 5. Bất biến nghiệp vụ kế toán (KHÔNG được vi phạm)

Đây là "luật" của phần mềm kế toán — vi phạm = dữ liệu sai, không cứu được.

1. **Cân bằng kép**: mỗi bút toán Σ Nợ = Σ Có. **Kiểm tra ở backend, không tin frontend.**
2. **Append-only**: bút toán đã ghi sổ **KHÔNG được sửa/xóa**. Sai thì tạo **bút toán đảo**
   (reversing entry), giữ nguyên lịch sử.
3. **Khóa kỳ kế toán**: chặn mọi bút toán vào kỳ đã đóng/locked.
4. **Chỉ ghi vào tài khoản lá** (`is_postable = true`), không ghi vào tài khoản cha.
5. **Tiền tệ**: dùng `NUMERIC(19,4)` trong DB + `decimal.js` trong code.
   **TUYỆT ĐỐI KHÔNG dùng `number`/float cho số tiền.**
6. **Idempotency**: dùng idempotency key chống ghi trùng; khóa đồng thời (optimistic/pessimistic lock)
   khi cập nhật số dư.
7. **Ghi sổ trong 1 transaction**: tạo nháp → xác nhận → ghi sổ phải nguyên tử.
8. **Audit**: mọi thay đổi phải có audit log (before/after, actor, thời điểm).

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

Khởi động hạ tầng (nếu có Docker): `docker compose up -d` trong `Accounting Ledger/`.

Sau khi chạy: API tại `http://localhost:3000/api`, Swagger tại `http://localhost:3000/api/docs`.

---

## 8. API đã có (Auth & phân quyền)

| Method | Route | Quyền |
|---|---|---|
| POST | `/api/auth/login` | public |
| POST | `/api/auth/refresh` | public |
| POST | `/api/auth/logout` | đã đăng nhập |
| GET | `/api/auth/me` | đã đăng nhập |
| POST | `/api/auth/change-password` | đã đăng nhập |
| GET/POST/PATCH | `/api/users`, `/api/users/:id` | **admin** |
| GET | `/api/health` | public |

---

## 9. Lộ trình (tóm tắt — chi tiết ở `DEVELOPMENT_PLAN.md`)

- **Giai đoạn 1**: Account, FiscalPeriod, Journal, JournalLine, AccountBalance, AuditLog
  + constraint cân bằng Nợ/Có + migration + seed demo. ← *bước tiếp theo*
- **Giai đoạn 2**: Journal workflow (nháp→xác nhận→ghi sổ), reversing entry, idempotency.
- **Giai đoạn 3**: Sổ cái, số dư, Trial Balance.
- **Giai đoạn 4**: Báo cáo tài chính (P&L, Balance Sheet, Cash Flow) + xuất Excel/PDF.
- **Giai đoạn 5**: Queue/Schedule jobs, audit log, webhook.
- **Giai đoạn 6**: Mở rộng — Mini ERP, Payment & Reconciliation, đa tiền tệ.

---

## 10. Quy tắc làm việc của AI

- **Sửa code thì phải verify**: sau khi đổi code chạy `pnpm build` + `pnpm test` (+ `pnpm lint`).
  Không tuyên bố "xong" nếu chưa build/test pass.
- **Không đoán bí mật** (mật khẩu DB, secret). Thiếu thì **hỏi người dùng**.
- **Không phá môi trường**: tuân thủ mục 4. Không tự ý cài/xóa thứ ngoài phạm vi yêu cầu.
- **Không hardcode secret** vào code; đưa vào `.env` và cập nhật `.env.example` tương ứng.
- **Cập nhật tài liệu** khi thêm module: `FUTURE_FEATURES.md` (đánh dấu ✅/🟡/⏳) và file này nếu cần.
- **Ghi memory** sau khi hoàn thành việc thực chất (append vào `memory/YYYY-MM-DD.md`).
- **Ngôn ngữ trả lời**: tiếng Việt (trừ khi người dùng yêu cầu khác).

---

*Cập nhật file này mỗi khi có quyết định kỹ thuật mới hoặc phát hiện bẫy môi trường mới.*
