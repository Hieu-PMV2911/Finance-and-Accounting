// Sửa liên kết node_modules của pnpm khi bước "link" bị môi trường chặn.
//
// Trong một số môi trường (sandbox/Windows), pnpm giải nén package vào store
// `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>` nhưng KHÔNG tạo được các
// junction liên kết (cả top-level lẫn giữa các package). Script này tái tạo lại
// đúng những junction còn thiếu, dựa trên chính store đã có sẵn.
//
// Chạy:  node fix-pnpm-links.mjs <thư-mục-Backend>
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Thiếu tham số: đường dẫn thư mục Backend');
  process.exit(1);
}

const store = path.join(root, 'node_modules', '.pnpm');

// ------------------------------------------------------------------ semver
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/.exec(v ?? '');
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? '' };
}
function cmp(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}
/** Hỗ trợ ^ ~ >= <= > < và số cụ thể — đủ cho các range phổ biến trong npm. */
function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v || !range) return false;
  const r = String(range).trim();
  if (r === '*' || r === 'latest') return true;
  const parts = r.split('||').map((s) => s.trim());
  return parts.some((part) => {
    if (part.includes(' ')) return true; // range phức tạp: chấp nhận để không chặn
    const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(part);
    if (!m) return false;
    const op = m[1] ?? '=';
    const base = parseVersion(m[2]);
    if (!base) return true;
    const c = cmp(v, base);
    switch (op) {
      case '^':
        return c >= 0 && v.major === base.major;
      case '~':
        return c >= 0 && v.major === base.major && v.minor === base.minor;
      case '>=':
        return c >= 0;
      case '<=':
        return c <= 0;
      case '>':
        return c > 0;
      case '<':
        return c < 0;
      default:
        return c === 0;
    }
  });
}

// ------------------------------------------------------------------- index
const index = new Map(); // name -> [{ dir, version, pkg }]

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

for (const entry of fs.readdirSync(store)) {
  const dir = path.join(store, entry);
  const inner = path.join(dir, 'node_modules');
  if (!fs.existsSync(inner)) continue;

  let names = [];
  try {
    names = fs.readdirSync(inner);
  } catch {
    continue;
  }

  for (const name of names) {
    if (name === '.bin' || name === '.modules.yaml') continue;
    const candidates = name.startsWith('@')
      ? fs
          .readdirSync(path.join(inner, name))
          .map((sub) => `${name}/${sub}`)
      : [name];

    for (const fullName of candidates) {
      const pkgDir = path.join(inner, fullName);
      const pkg = readJson(path.join(pkgDir, 'package.json'));
      if (!pkg || !pkg.version) continue;
      const list = index.get(fullName) ?? [];
      list.push({ dir, version: pkg.version, pkg });
      index.set(fullName, list);
    }
  }
}

console.log(`[store] ${index.size} package name(s) indexed`);

// ------------------------------------------------------------------ linking
let created = 0;
let skipped = 0;
const missing = [];

/** Tạo junction nếu còn thiếu; LUÔN trả về package đã chọn để đi tiếp dependency. */
function resolveAndLink(parentDir, name, range) {
  const candidates = index.get(name);
  if (!candidates || candidates.length === 0) {
    missing.push(name);
    return null;
  }
  const chosen = pick(candidates, range);
  const linkPath = path.join(parentDir, 'node_modules', name);
  if (fs.existsSync(linkPath)) {
    skipped += 1;
  } else {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(
      path.join(chosen.dir, 'node_modules', name),
      linkPath,
      'junction',
    );
    created += 1;
  }
  return chosen;
}

function pick(candidates, range) {
  const sorted = [...candidates].sort((a, b) =>
    cmp(parseVersion(b.version), parseVersion(a.version)),
  );
  return sorted.find((c) => satisfies(c.version, range)) ?? sorted[0];
}

const queue = [];
function enqueueDeps(parentDir, pkg) {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  for (const [name, range] of Object.entries(deps)) {
    queue.push({ parentDir, name, range });
  }
}

// 1. Top-level: mọi dependency trực tiếp trong package.json
const rootPkg = readJson(path.join(root, 'package.json'));
for (const [name, range] of Object.entries({
  ...(rootPkg.dependencies ?? {}),
  ...(rootPkg.devDependencies ?? {}),
})) {
  const chosen = resolveAndLink(root, name, range);
  if (chosen) enqueueDeps(chosen.dir, chosen.pkg);
}

// 2. Closure: đi theo dependency của từng package đã liên kết
const seen = new Set();
while (queue.length > 0) {
  const { parentDir, name, range } = queue.shift();
  const key = `${parentDir}::${name}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const chosen = resolveAndLink(parentDir, name, range);
  if (chosen) enqueueDeps(chosen.dir, chosen.pkg);
}

console.log(`[link] created=${created} skipped(existing)=${skipped}`);
if (missing.length > 0) {
  console.log(`[missing] ${[...new Set(missing)].join(', ')}`);
}
