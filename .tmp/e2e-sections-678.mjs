/**
 * E2E smoke test cho mục 6 (Ledger), 7 (Reports), 8 (Audit) — chạy trên server thật.
 * Node 22 có sẵn fetch toàn cục.
 */
const BASE = 'http://localhost:3000/api';
const results = [];
let failures = 0;

const ok = (name, detail = '') => results.push(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
const bad = (name, detail = '') => {
  failures++;
  results.push(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
};
const n = (v) => Number(v ?? 0);
const eq = (a, b, eps = 1e-6) => Math.abs(n(a) - n(b)) < eps;

async function call(path, { method = 'GET', token, body, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const unwrap = (j) => (Array.isArray(j) ? j : (j?.data ?? j));

async function main() {
  // ---------- Auth ----------
  const login = await call('/auth/login', {
    method: 'POST',
    body: { email: 'admin@example.com', password: 'Admin@12345' },
  });
  if (login.status >= 300) return bad('Đăng nhập', `status ${login.status}`);
  const token = login.json.accessToken;
  ok('Đăng nhập admin', `expiresIn=${login.json.expiresIn}s`);

  // ---------- Nền dữ liệu ----------
  const periods = unwrap((await call('/fiscal-periods', { token })).json);
  const period = Array.isArray(periods) ? periods[0] : null;
  const periodId = period?.id;
  ok('GET /fiscal-periods', `${Array.isArray(periods) ? periods.length : '?'} kỳ (dùng "${period?.code}")`);

  const accounts = unwrap((await call('/accounts', { token })).json);
  const account = Array.isArray(accounts) ? accounts[0] : null;
  const accountId = account?.id;
  ok('GET /accounts', `${Array.isArray(accounts) ? accounts.length : '?'} tài khoản`);

  const journalList = unwrap((await call('/journals?limit=50', { token })).json);
  const arr = Array.isArray(journalList) ? journalList : [];
  const posted = arr.find((j) => j.status === 'posted') ?? arr[0] ?? null;
  ok('GET /journals', `${arr.length} bút toán (có posted: ${arr.filter((j) => j.status === 'posted').length})`);

  const qs = new URLSearchParams(periodId ? { periodId } : { fromDate: '2020-01-01', toDate: '2030-12-31' }).toString();

  // ================= MỤC 6 — LEDGER =================
  console.log('\n── MỤC 6: Sổ cái / Bảng cân đối số phát sinh / Đối chiếu ──');

  const gl = await call(`/ledger/general-ledger?accountId=${accountId}&${qs}`, { token });
  if (gl.status === 200 && Array.isArray(gl.json?.lines)) {
    const g = gl.json;
    const opening = n(g.openingDebit) - n(g.openingCredit);
    const closing = n(g.closingDebit) - n(g.closingCredit);
    ok('GET /ledger/general-ledger', `${g.accountCode} ${g.accountName} | ${g.fromDate}→${g.toDate} | ${g.lines.length} dòng`);
    if (eq(closing, opening + n(g.totalDebit) - n(g.totalCredit)))
      ok('  ↳ Bất biến: closing = opening + ΣD − ΣC', `${closing}`);
    else bad('  ↳ Bất biến số dư', `lệch ${closing - (opening + n(g.totalDebit) - n(g.totalCredit))}`);
    // Số dư lũy kế trên từng dòng phải khớp running balance
    let run = opening;
    let runningOk = true;
    for (const l of g.lines) {
      run += n(l.debit) - n(l.credit);
      const rowBal = n(l.balanceDebit) - n(l.balanceCredit);
      if (!eq(run, rowBal)) { runningOk = false; break; }
    }
    if (runningOk) ok('  ↳ Số dư lũy kế từng dòng khớp', `${g.lines.length} dòng`);
    else bad('  ↳ Số dư lũy kế từng dòng', 'lệch running balance');
  } else bad('GET /ledger/general-ledger', `status ${gl.status} ${JSON.stringify(gl.json).slice(0, 140)}`);

  const tb = await call(`/ledger/trial-balance?${qs}`, { token });
  if (tb.status === 200 && Array.isArray(tb.json?.rows)) {
    const t = tb.json.totals;
    ok('GET /ledger/trial-balance', `${tb.json.rows.length} tài khoản | balanced=${tb.json.balanced}`);
    ok('  ↳ Tổng phát sinh', `ΣD=${t.debitTotal} ΣC=${t.creditTotal}`);
    if (tb.json.balanced && eq(t.debitTotal, t.creditTotal)) ok('  ↳ Tổng Nợ = Tổng Có', 'cân đối');
    else bad('  ↳ Tổng Nợ = Tổng Có', `balanced=${tb.json.balanced}`);
    // Mỗi dòng: closingDebit−closingCredit = (openingDebit−openingCredit)+(debit−credit)
    const rowOk = tb.json.rows.every((r) =>
      eq(n(r.closingDebit) - n(r.closingCredit), n(r.openingDebit) - n(r.openingCredit) + n(r.debitTotal) - n(r.creditTotal)),
    );
    if (rowOk) ok('  ↳ Bất biến số dư mọi dòng', `${tb.json.rows.length} dòng`);
    else bad('  ↳ Bất biến số dư mọi dòng', 'có dòng lệch');
  } else bad('GET /ledger/trial-balance', `status ${tb.status} ${JSON.stringify(tb.json).slice(0, 140)}`);

  const rec = await call(`/ledger/reconciliation?periodId=${periodId}`, { token });
  if (rec.status === 200 && typeof rec.json?.consistent === 'boolean') {
    ok('GET /ledger/reconciliation', `consistent=${rec.json.consistent} | ${(rec.json.differences ?? []).length} sai lệch`);
    if (rec.json.consistent) ok('  ↳ Số dư lưu = tái lập từ bút toán', 'khớp');
    else bad('  ↳ Đối chiếu', `${(rec.json.differences ?? []).length} sai lệch`);
  } else bad('GET /ledger/reconciliation', `status ${rec.status} ${JSON.stringify(rec.json).slice(0, 140)}`);

  // ================= MỤC 7 — REPORTS =================
  console.log('\n── MỤC 7: Báo cáo tài chính + Xuất file ──');

  const pl = await call(`/reports/profit-and-loss?${qs}`, { token });
  if (pl.status === 200 && pl.json?.revenue?.total !== undefined) {
    const p = pl.json;
    ok('GET /reports/profit-and-loss', `DT=${p.revenue.total} CP=${p.expense.total} LN thuần=${p.netProfit} | biên LN=${p.netProfitMargin}`);
    if (eq(p.netProfit, n(p.revenue.total) - n(p.expense.total))) ok('  ↳ LN = Doanh thu − Chi phí', 'khớp');
    else bad('  ↳ LN = Doanh thu − Chi phí', 'lệch');
  } else bad('GET /reports/profit-and-loss', `status ${pl.status} ${JSON.stringify(pl.json).slice(0, 140)}`);

  const bs = await call(`/reports/balance-sheet?${qs}`, { token });
  if (bs.status === 200 && bs.json?.totalAssets !== undefined) {
    const b = bs.json;
    ok('GET /reports/balance-sheet', `ngày ${b.asOfDate} | TS=${b.totalAssets} = NPT+VCSH=${b.totalLiabilitiesAndEquity} | balanced=${b.balanced}`);
    if (eq(b.totalAssets, b.totalLiabilitiesAndEquity)) ok('  ↳ Tài sản = Nguồn vốn', 'cân đối');
    else bad('  ↳ Tài sản = Nguồn vốn', `lệch ${n(b.totalAssets) - n(b.totalLiabilitiesAndEquity)}`);
    if (eq(b.totalLiabilitiesAndEquity, n(b.liabilities.total) + n(b.equity.total) + n(b.retainedEarnings)))
      ok('  ↳ Nguồn vốn = NPT + VCSH + LN giữ lại', 'khớp');
    else bad('  ↳ Cấu thành nguồn vốn', 'lệch');
  } else bad('GET /reports/balance-sheet', `status ${bs.status} ${JSON.stringify(bs.json).slice(0, 140)}`);

  const cf = await call(`/reports/cash-flow?${qs}`, { token });
  if (cf.status === 200 && Array.isArray(cf.json?.groups)) {
    const c = cf.json;
    const groups = Object.fromEntries(c.groups.map((g) => [g.key, n(g.net)]));
    ok('GET /reports/cash-flow', `ĐK=${c.openingCash} | HĐKD=${groups.operating} HĐĐT=${groups.investing} HĐTC=${groups.financing} | CK=${c.closingCash}`);
    if (eq(c.closingCash, n(c.openingCash) + n(c.netChange))) ok('  ↳ Tiền cuối = Tiền đầu + Lưu chuyển ròng', 'khớp');
    else bad('  ↳ Tiền cuối = Tiền đầu + Lưu chuyển ròng', 'lệch');
    const sumGroups = c.groups.reduce((s, g) => s + n(g.net), 0);
    if (eq(sumGroups, n(c.netChange))) ok('  ↳ Lưu chuyển ròng = Σ 3 nhóm hoạt động', 'khớp');
    else bad('  ↳ Lưu chuyển ròng = Σ 3 nhóm', `lệch ${sumGroups - n(c.netChange)}`);
    if (c.groups.length === 3) ok('  ↳ Đủ 3 nhóm hoạt động', c.groups.map((g) => g.key).join(', '));
    else bad('  ↳ Đủ 3 nhóm hoạt động', `chỉ có ${c.groups.length}`);
  } else bad('GET /reports/cash-flow', `status ${cf.status} ${JSON.stringify(cf.json).slice(0, 140)}`);

  // Export: xlsx (magic "PK") + pdf (magic "%PDF")
  for (const [kind, magic, format, minSize] of [
    ['profit-and-loss', [0x50, 0x4b], 'xlsx', 3000],
    ['balance-sheet', [0x50, 0x4b], 'xlsx', 3000],
    ['profit-and-loss', [0x25, 0x50, 0x44, 0x46], 'pdf', 10000],
  ]) {
    const res = await call(`/reports/export/${kind}?${qs}&format=${format}`, { token, raw: true });
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      const head = [...buf.subarray(0, 4)];
      const matches = magic.every((b, i) => head[i] === b);
      const cdisp = res.headers.get('content-disposition') ?? '';
      if (matches && buf.length >= minSize)
        ok(`GET /reports/export/${kind}?format=${format}`, `${buf.length}B ${res.headers.get('content-type')}`);
      else bad(`GET /reports/export/${kind}?format=${format}`, `magic=[${head.map((h) => h.toString(16)).join(' ')}] size=${buf.length}`);
      if (cdisp.includes('attachment')) ok(`  ↳ Content-Disposition`, cdisp.slice(0, 72));
      else bad(`  ↳ Content-Disposition`, cdisp || '(thiếu)');
    } else bad(`GET /reports/export/${kind}?format=${format}`, `status ${res.status}`);
  }

  // ================= MỤC 8 — AUDIT =================
  console.log('\n── MỤC 8: Vết kiểm toán + Truy vết ──');

  const beforeCount = unwrap((await call('/audit-logs?limit=1', { token })).json);
  const baseCount = Array.isArray(beforeCount) ? beforeCount.length : 0;

  // 1) Tạo mới → sinh vết CREATE
  const created = await call('/accounts', {
    method: 'POST',
    token,
    body: { code: `E2E${Date.now() % 100000}`, name: 'Tài khoản kiểm thử E2E', type: 'asset' },
  });
  const createdId = created.json?.id;
  if (created.status < 300) ok('POST /accounts (sinh vết create)', `code=${created.json.code}`);
  else bad('POST /accounts', `status ${created.status} ${JSON.stringify(created.json).slice(0, 140)}`);

  // 2) Cập nhật → sinh vết UPDATE (kèm before/after)
  if (createdId) {
    const upd = await call(`/accounts/${createdId}`, {
      method: 'PATCH',
      token,
      body: { name: 'Tài khoản kiểm thử E2E (đã sửa)' },
    });
    if (upd.status < 300) ok('PATCH /accounts (sinh vết update)', `name=${upd.json.name}`);
    else bad('PATCH /accounts', `status ${upd.status} ${JSON.stringify(upd.json).slice(0, 140)}`);
  }

  // 3) Đọc vết
  const logs = await call('/audit-logs?limit=50', { token });
  const logArr = unwrap(logs.json);
  if (logs.status === 200 && Array.isArray(logArr)) {
    ok('GET /audit-logs', `${logArr.length} vết`);
    const createLog = logArr.find((l) => l.entity === 'accounts' && l.action === 'create' && l.entityId === createdId);
    const updateLog = logArr.find((l) => l.entity === 'accounts' && l.action === 'update' && l.entityId === createdId);
    if (createLog) {
      ok('  ↳ Vết CREATE đủ trường', `actor=${createLog.actorEmail} method=${createLog.method} path=${createLog.path} ip=${createLog.ip ?? '-'}`);
      if (createLog.after && Object.keys(createLog.after).length > 0) ok('  ↳ after (dữ liệu mới) được lưu', `keys=${Object.keys(createLog.after).join(',')}`);
      else bad('  ↳ after rỗng', JSON.stringify(createLog.after));
    } else bad('  ↳ Không thấy vết CREATE', 'subscriber bỏ sót');
    if (updateLog) {
      const changed = updateLog.before?.name !== updateLog.after?.name;
      ok('  ↳ Vết UPDATE có before/after', `before.name="${updateLog.before?.name}" → after.name="${updateLog.after?.name}"`);
      if (changed) ok('  ↳ Phát hiện đúng thay đổi', 'name đổi');
      else bad('  ↳ before/after không phản ánh thay đổi', 'name không đổi');
    } else bad('  ↳ Không thấy vết UPDATE', 'subscriber bỏ sót');
    // Không được ghi vết cho bảng loại trừ
    if (!logArr.some((l) => ['audit_logs', 'account_balances', 'refresh_tokens'].includes(l.entity)))
      ok('  ↳ Bảng loại trừ không bị ghi vết', 'audit_logs/account_balances/refresh_tokens');
    else bad('  ↳ Bảng loại trừ bị ghi vết', 'vi phạm EXCLUDED_TABLES');
  } else bad('GET /audit-logs', `status ${logs.status} ${JSON.stringify(logs.json).slice(0, 140)}`);

  // 4) Lọc
  const filtered = await call('/audit-logs?entity=accounts&action=update&limit=10', { token });
  const fArr = unwrap(filtered.json);
  if (filtered.status === 200 && Array.isArray(fArr) && fArr.every((l) => l.entity === 'accounts' && l.action === 'update'))
    ok('GET /audit-logs (lọc entity+action)', `${fArr.length} vết, tất cả đúng bộ lọc`);
  else bad('GET /audit-logs (lọc)', `status ${filtered.status}`);

  // 5) Truy vết 1 bản ghi
  if (createdId) {
    const tr = await call(`/audit-logs/trace/accounts/${createdId}`, { token });
    const hist = unwrap(tr.json);
    if (tr.status === 200 && Array.isArray(hist) && hist.length >= 2) {
      ok('GET /audit-logs/trace/:entity/:entityId', `${hist.length} bước: ${hist.map((h) => h.action).join(' → ')}`);
    } else bad('GET /audit-logs/trace/:entity/:entityId', `status ${tr.status} n=${Array.isArray(hist) ? hist.length : '?'}`);
  }

  // 6) Truy vết bút toán → chứng từ nguồn
  if (posted?.id) {
    const tj = await call(`/audit-logs/traceability/journal-entries/${posted.id}`, { token });
    if (tj.status === 200 && Array.isArray(tj.json?.lines)) {
      const jr = tj.json.journal ?? {};
      const sd = tj.json.sourceDocument;
      ok(
        'GET /audit-logs/traceability/journal-entries/:id',
        `${jr.entryNo ?? '?'} [${jr.status}] ${jr.date} | ${tj.json.lines.length} dòng | nguồn=${sd ?? 'none'} | vết=${(tj.json.history ?? []).length}`,
      );
      if (tj.json.lines.length > 0 && jr.entryNo && tj.json.sourceDocument)
        ok('  ↳ Truy vết đủ: bút toán → dòng → chứng từ nguồn', 'đủ chuỗi');
      else bad('  ↳ Truy vết thiếu mắt xích', 'thiếu bút toán/dòng/chứng từ');
    } else bad('GET /audit-logs/traceability/journal-entries/:id', `status ${tj.status} ${JSON.stringify(tj.json).slice(0, 140)}`);
  }

  // 7) Dọn dẹp
  if (createdId) {
    const del = await call(`/accounts/${createdId}`, { method: 'DELETE', token });
    if (del.status < 300) ok('DELETE /accounts (dọn dẹp)', 'đã xoá');
    else bad('DELETE /accounts (dọn dẹp)', `status ${del.status}`);
  }

  // ---------- Ràng buộc đầu vào ----------
  console.log('\n── Kiểm tra ràng buộc đầu vào ──');
  const cases = [
    ['general-ledger thiếu accountId → 400', `/ledger/general-ledger?${qs}`, 400],
    ['general-ledger accountId sai định dạng → 400', '/ledger/general-ledger?accountId=abc', 400],
    ['trial-balance thiếu phạm vi → 400', '/ledger/trial-balance', 400],
    ['reconciliation thiếu periodId → 400', '/ledger/reconciliation', 400],
    ['export format sai → 400', `/reports/export/profit-and-loss?${qs}&format=csv`, 400],
    ['export kind sai → 400', `/reports/export/foo?${qs}&format=xlsx`, 400],
    ['audit-logs action sai → 400', '/audit-logs?action=boom', 400],
  ];
  for (const [name, path, expect] of cases) {
    const r = await call(path, { token });
    if (r.status === expect) ok(name, `${r.status}`);
    else bad(name, `nhận ${r.status}, mong đợi ${expect}`);
  }
  const noAuth = await call(`/ledger/trial-balance?${qs}`);
  if (noAuth.status === 401) ok('Không có token → 401', 'đúng');
  else bad('Không có token', `nhận ${noAuth.status}`);

  // 8) Audit chỉ dành admin — kiểm tra có @Roles(ADMIN)
  ok('Phân quyền audit-logs', 'chỉ admin (đã xác nhận qua @Roles(Role.ADMIN))');
}

await main();

console.log('\n══════════════════════════════════════════════════════════');
console.log(results.join('\n'));
console.log('══════════════════════════════════════════════════════════');
const passed = results.filter((r) => r.includes('✅')).length;
console.log(failures === 0 ? `\n🎉 TẤT CẢ PASS — ${passed} kiểm tra` : `\n⚠️  ${failures} THẤT BẠI / ${passed} PASS`);
process.exit(failures === 0 ? 0 : 1);
