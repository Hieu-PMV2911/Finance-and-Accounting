# TECHNICAL SPECIFICATION: Ultra-Lightweight Classname Utility (`clsx` / `@core/clsx`)

> **Mục tiêu:** Xây dựng/Tái cấu trúc thư viện nối chuỗi CSS class-name siêu nhẹ (chỉ khoảng **229 bytes** gzipped), zero-dependency, tốc độ thực thi vượt trội (nhanh hơn thư viện legacy `classnames` từ 3 - 6 lần), hỗ trợ TypeScript chuẩn mực và tree-shaking 100%.

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

* **Package Name:** `@core/clsx` (hoặc `clsx-lite`)
* **Inspiration:** Thư viện [`clsx`](https://github.com/lukeed/clsx) nổi tiếng của Luke Edwards.
* **Target Runtime:** Universal (Browser, Node.js, Bun, Deno, React Native, Edge Runtimes)
* **Module Format:** Dual Build (ESM `.mjs` + CommonJS `.cjs`)
* **Bundle Size Limit:** `<= 230 bytes` (minified + gzipped)
* **Dependencies:** `0` (Zero Third-Party Dependencies)
* **TypeScript Support:** Tích hợp sẵn `.d.ts` hỗ trợ nhận nhiều định dạng dữ liệu linh hoạt (Strings, Numbers, Objects, Arrays, Nested Structures, Truthy/Falsy values).

---

## 2. LÝ DO RA ĐỜI & BÀI TOÁN GIẢI QUYẾT

### Bài toán với `classnames` (Legacy Package):
* Thư viện `classnames` lâu đời có dung lượng lớn hơn (~500 bytes - 1KB gzipped).
* Tốc độ thực thi chậm hơn do chứa nhiều đoạn code legacy, kiểm tra type rườm rà không cần thiết.
* Cấu hình build cũ, tối ưu kém cho ESM và các bundler hiện đại (Vite, Rollup, Esbuild).

### Giải pháp từ `clsx`:
* **Tốc độ tối đa (High Performance):** Sử dụng vòng lặp `while` / `for` đơn giản và thuật toán duyệt phẳng (flattening) mảng/object tối giản nhất.
* **Siêu nhỏ (Tiny footprint):** Cắt bỏ toàn bộ mã thừa, tập trung vào lõi xử lý nối chuỗi.
* **Linh hoạt đầu vào:** Nhận vô số tham số với đủ mọi kiểu dữ liệu (`string`, `number`, `boolean`, `null`, `undefined`, `object`, `array`).

---

## 3. CẤU TRÚC THƯ MỤC (DIRECTORY STRUCTURE)

```text
.
├── src/
│   ├── index.ts          # Main implementation (Lite / Default version)
│   ├── lite.ts           # Bản siêu gọn (chỉ nhận String/Number/Array, bỏ Object)
│   └── index.d.ts        # Type Definitions
├── tests/
│   └── index.test.ts     # Unit Tests bằng Vitest
├── bench/
│   └── index.bench.ts    # Benchmark so sánh với classnames
├── package.json
├── tsup.config.ts        # Bundler configuration
├── tsconfig.json
└── README.md
```

---

## 4. CÔNG NGHỆ & CÔNG CỤ SỬ DỤNG (TECH STACK & TOOLING)

* **Language:** TypeScript 5.x
* **Build Tool:** `tsup` (Dùng `esbuild` bên dưới để minify tối đa)
* **Test Runner:** `vitest`
* **Benchmarking:** `tinybench` / `mitata`
* **Size Analysis:** `size-limit` hoặc `bundlesize` để đảm bảo không vượt quá 229 bytes.

---

## 5. QUY TẮC DUYỆT ĐẦU VÀO & LOGIC XỬ LÝ (CORE LOGIC & RULES)

Hàm `clsx(...inputs)` phải lọc và nối các class name theo quy tắc sau:

| Kiểu dữ liệu đầu vào (Input Type) | Ví dụ Input | Kết quả đầu ra (Output) |
| :--- | :--- | :--- |
| **String / Number** | `'btn'`, `123` | `'btn 123'` |
| **Falsy values** | `null`, `undefined`, `false`, `0`, `''` | Bị loại bỏ hoàn toàn |
| **Boolean** | `true` | Bị loại bỏ |
| **Object** | `{ active: true, disabled: false }` | `'active'` (chỉ lấy key có value truthy) |
| **Array** | `['btn', ['active', false]]` | `'btn active'` (Duyệt phẳng mảng đệ quy) |
| **Kết hợp phức tạp** | `clsx('foo', { bar: true, duck: false }, 'baz', [0, 'hello'])` | `'foo bar baz hello'` |

---

## 6. THIẾT LẬP MÃ NGUỒN CỐT LÕI (CORE IMPLEMENTATION)

### 6.1 Implement Runtime (`src/index.ts`)

```typescript
export type ClassValue = ClassArray | ClassDictionary | string | number | null | boolean | undefined;
export type ClassDictionary = Record<string, any>;
export type ClassArray = ClassValue[];

function toVal(mix: ClassValue): string {
  let k, y, str = '';

  if (typeof mix === 'string' || typeof mix === 'number') {
    str += mix;
  } else if (typeof mix === 'object' && mix !== null) {
    if (Array.isArray(mix)) {
      let len = mix.length;
      for (k = 0; k < len; k++) {
        if (mix[k]) {
          if ((y = toVal(mix[k]))) {
            str && (str += ' ');
            str += y;
          }
        }
      }
    } else {
      for (k in mix) {
        if (mix[k]) {
          str && (str += ' ');
          str += k;
        }
      }
    }
  }

  return str;
}

export function clsx(...args: ClassValue[]): string {
  let i = 0, tmp, x, str = '', len = args.length;
  for (; i < len; i++) {
    if ((tmp = args[i])) {
      if ((x = toVal(tmp))) {
        str && (str += ' ');
        str += x;
      }
    }
  }
  return str;
}

export default clsx;
```

---

## 7. CẤU HÌNH PACKAGE & BUILD (`package.json`)

```json
{
  "name": "@core/clsx",
  "version": "1.0.0",
  "description": "A tiny (229B) utility for constructing className strings conditionally.",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "bench": "tsx bench/index.bench.ts"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 8. BỘ UNIT TEST BẮT BUỘC (`tests/index.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { clsx } from '../src/index';

describe('clsx specs', () => {
  it('keeps object keys with truthy values', () => {
    expect(clsx({ a: true, b: false, c: 0, d: null, e: undefined, f: 1 })).toBe('a f');
  });

  it('joins arrays of class names and ignores falsy values', () => {
    expect(clsx(['a', 0, false, null, undefined, 'b', true])).toBe('a b');
  });

  it('supports nested arrays and objects', () => {
    expect(clsx('a', ['b', { c: true, d: false }])).toBe('a b c');
  });

  it('handles variadic arguments correctly', () => {
    expect(clsx('a', 'b', 'c')).toBe('a b c');
  });

  it('returns empty string for no arguments or all falsy inputs', () => {
    expect(clsx()).toBe('');
    expect(clsx(null, false, undefined, 0, '')).toBe('');
  });
});
```

---

## 9. CÁC CHỈ DẪN CHO AI (PROMPT FOR GENERATION)

> *"Dựa vào thông tin chi tiết trong `PROJECT_SPEC_CLSX.md`, hãy khởi tạo một dự án npm siêu nhẹ tên `@core/clsx`. Triển khai mã nguồn chính xác theo giải thuật tối ưu kích thước (< 230 bytes), hỗ trợ đầy đủ TypeScript types, thiết lập build tsup cho dual module (ESM/CJS) và tạo bộ Unit Test bằng Vitest để bao phủ 100% các trường hợp dữ liệu đầu vào."*