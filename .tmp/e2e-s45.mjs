/**
 * E2E verification for API sections 4 (Fiscal Periods) & 5 (Journals).
 * Exercises the real HTTP API against the real PostgreSQL database.
 */
const BASE = 'http://127.0.0.1:3000/api';

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function section(title) {
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
section('0. Đăng nhập & chuẩn bị người dùng theo vai trò');

const adminToken = await login('admin@example.com', 'Admin@12345');
ok('admin đăng nhập', !!adminToken);

async function ensureUser(email, password, roles) {
  const created = await req('POST', '/users', {
    token: adminToken,
    body: { email, password, fullName: email.split('@')[0], roles },
  });
  if (created.status === 201) return created.data;
  const list = await req('GET', `/users?search=${encodeURIComponent(email)}`, {
    token: adminToken,
  });
  const found = (list.data?.items ?? list.data ?? []).find((u) => u.email === email);
  return found;
}

await ensureUser('maker@example.com', 'Maker@12345', ['maker']);
await ensureUser('checker@example.com', 'Checker@12345', ['checker']);
await ensureUser('poster@example.com', 'Poster@12345', ['poster']);

const makerToken = await login('maker@example.com', 'Maker@12345');
const checkerToken = await login('checker@example.com', 'Checker@12345');
const posterToken = await login('poster@example.com', 'Poster@12345');
ok('maker / checker / poster đăng nhập', !!makerToken && !!checkerToken && !!posterToken);

// ─────────────────────────────────────────────────────────────────────────────
section('1. Danh mục tài khoản (chuẩn bị cho bút toán)');

async function ensureAccount(code, name, type, parentId) {
  const list = await req('GET', `/accounts?search=${encodeURIComponent(code)}`, {
    token: adminToken,
  });
  const items = list.data?.items ?? list.data ?? [];
  const found = items.find((a) => a.code === code);
  if (found) return found;
  const created = await req('POST', '/accounts', {
    token: adminToken,
    body: { code, name, type, parentId },
  });
  if (created.status !== 201) {
    throw new Error(`create account ${code}: ${created.status} ${JSON.stringify(created.data)}`);
  }
  return created.data;
}

const acc111 = await ensureAccount('111', 'Tiền mặt Việt Nam Đồng', 'asset');
const acc112 = await ensureAccount('112', 'Tiền gửi ngân hàng', 'asset');
const acc411 = await ensureAccount('411', 'Vốn đầu tư của chủ sở hữu', 'equity');
const acc511 = await ensureAccount('511', 'Doanh thu bán hàng', 'revenue');
const acc642 = await ensureAccount('642', 'Chi phí quản lý kinh doanh', 'expense');
ok('đã có 5 tài khoản lá', [acc111, acc112, acc411, acc511, acc642].every((a) => a?.id));

// ─────────────────────────────────────────────────────────────────────────────
section('2. Kỳ kế toán — tạo & kiểm tra ràng buộc (API 4)');

const periodCode = `2026-01-${Date.now().toString().slice(-5)}`;
const created = await req('POST', '/fiscal-periods', {
  token: adminToken,
  body: {
    code: periodCode,
    name: 'Tháng 01/2026',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  },
});
ok('tạo kỳ kế toán', created.status === 201, `status ${created.status}`);
const period = created.data;
ok('kỳ mới ở trạng thái open', period?.status === 'open', period?.status);

const dup = await req('POST', '/fiscal-periods', {
  token: adminToken,
  body: { code: periodCode, name: 'Trùng mã', startDate: '2026-03-01', endDate: '2026-03-31' },
});
ok('chặn mã kỳ trùng', dup.status === 409, `status ${dup.status}`);

const badRange = await req('POST', '/fiscal-periods', {
  token: adminToken,
  body: { code: `${periodCode}x`, name: 'Sai', startDate: '2026-05-31', endDate: '2026-05-01' },
});
ok('chặn khoảng ngày đảo ngược', badRange.status === 400, `status ${badRange.status}`);

const impossible = await req('POST', '/fiscal-periods', {
  token: adminToken,
  body: { code: `${periodCode}y`, name: 'Sai', startDate: '2026-02-31', endDate: '2026-03-01' },
});
ok('chặn ngày không tồn tại 2026-02-31', impossible.status === 400, `status ${impossible.status}`);

const overlap = await req('POST', '/fiscal-periods', {
  token: adminToken,
  body: { code: `${periodCode}z`, name: 'Chồng lấn', startDate: '2026-01-15', endDate: '2026-02-15' },
});
ok('chặn kỳ chồng lấn', overlap.status === 409, `status ${overlap.status}`);

const makerCreate = await req('POST', '/fiscal-periods', {
  token: makerToken,
  body: { code: `${periodCode}m`, name: 'Maker', startDate: '2026-07-01', endDate: '2026-07-31' },
});
ok('maker không được tạo kỳ (RBAC)', makerCreate.status === 403, `status ${makerCreate.status}`);

// ─────────────────────────────────────────────────────────────────────────────
section('3. Bút toán nháp — kiểm tra bất biến kế toán (API 5)');

const unbalanced = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-05',
    description: 'Nợ ≠ Có',
    lines: [
      { accountId: acc111.id, debit: '1000000' },
      { accountId: acc411.id, credit: '900000' },
    ],
  },
});
ok('chặn bút toán Nợ ≠ Có', unbalanced.status === 400, JSON.stringify(unbalanced.data?.message));

const bothSides = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-05',
    description: 'Một dòng ghi cả Nợ và Có',
    lines: [
      { accountId: acc111.id, debit: '500', credit: '500' },
      { accountId: acc411.id, credit: '500' },
    ],
  },
});
ok('chặn dòng ghi cả hai bên', bothSides.status === 400, JSON.stringify(bothSides.data?.message));

const oneLine = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-05',
    description: 'Chỉ 1 dòng',
    lines: [{ accountId: acc111.id, debit: '1000' }],
  },
});
ok('chặn bút toán < 2 dòng', oneLine.status === 400, `status ${oneLine.status}`);

const negative = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-05',
    description: 'Số âm',
    lines: [
      { accountId: acc111.id, debit: '-100' },
      { accountId: acc411.id, credit: '-100' },
    ],
  },
});
ok('chặn số tiền âm', negative.status === 400, `status ${negative.status}`);

const noPeriod = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2027-06-15',
    description: 'Ngoài mọi kỳ kế toán',
    lines: [
      { accountId: acc111.id, debit: '1000' },
      { accountId: acc411.id, credit: '1000' },
    ],
  },
});
ok('chặn ngày không thuộc kỳ nào', noPeriod.status === 404 || noPeriod.status === 400, `status ${noPeriod.status}`);

// Bút toán hợp lệ #1: góp vốn 100.000.000
const j1 = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-05',
    description: 'Chủ sở hữu góp vốn bằng tiền mặt',
    reference: 'UNC-001',
    lines: [
      { accountId: acc111.id, debit: '100000000' },
      { accountId: acc411.id, credit: '100000000' },
    ],
  },
});
ok('tạo bút toán nháp hợp lệ', j1.status === 201, `status ${j1.status}`);
const draft = j1.data;
ok('nháp chưa có số hiệu (entryNo = null)', draft?.entryNo === null, String(draft?.entryNo));
ok('nháp ở trạng thái draft', draft?.status === 'draft', draft?.status);
ok('tổng Nợ = tổng Có = 100000000.0000',
  draft?.totalDebit === '100000000.0000' && draft?.totalCredit === '100000000.0000',
  `${draft?.totalDebit} / ${draft?.totalCredit}`);

// Idempotency
const key = `idem-${Date.now()}`;
const i1 = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-06', description: 'Idempotent A', idempotencyKey: key,
    lines: [
      { accountId: acc112.id, debit: '7777' },
      { accountId: acc411.id, credit: '7777' },
    ],
  },
});
const i2 = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-06', description: 'Idempotent B (trùng key)', idempotencyKey: key,
    lines: [
      { accountId: acc112.id, debit: '7777' },
      { accountId: acc411.id, credit: '7777' },
    ],
  },
});
ok('idempotencyKey trùng → trả về cùng bút toán', i1.data?.id === i2.data?.id, `${i1.data?.id} vs ${i2.data?.id}`);

// Sửa / xóa chỉ khi nháp
const patched = await req('PATCH', `/journals/${draft.id}`, {
  token: makerToken,
  body: { description: 'Chủ sở hữu góp vốn bằng tiền mặt (đã sửa)' },
});
ok('sửa được bút toán nháp', patched.status === 200 && patched.data.description.includes('đã sửa'), `status ${patched.status}`);

const deleteDraft = await req('DELETE', `/journals/${i2.data.id}`, { token: makerToken });
ok('xóa được bút toán nháp', deleteDraft.status === 204, `status ${deleteDraft.status}`);

// ─────────────────────────────────────────────────────────────────────────────
section('4. Luồng maker → checker → poster');

const makerPost = await req('POST', `/journals/${draft.id}/post`, { token: makerToken });
ok('maker KHÔNG được ghi sổ (RBAC)', makerPost.status === 403, `status ${makerPost.status}`);

const posterApprove = await req('POST', `/journals/${draft.id}/approve`, { token: posterToken });
ok('poster KHÔNG được duyệt (RBAC)', posterApprove.status === 403, `status ${posterApprove.status}`);

const approved = await req('POST', `/journals/${draft.id}/approve`, { token: checkerToken });
ok('checker duyệt bút toán', approved.status === 200 || approved.status === 201, `status ${approved.status}`);
ok('trạng thái = approved', approved.data?.status === 'approved', approved.data?.status);
ok('ghi nhận người duyệt', !!approved.data?.approvedBy && !!approved.data?.approvedAt);

const editApproved = await req('PATCH', `/journals/${draft.id}`, {
  token: makerToken, body: { description: 'Sửa sau khi duyệt' },
});
ok('chặn sửa bút toán đã duyệt', editApproved.status === 400 || editApproved.status === 409, `status ${editApproved.status}`);

const posterApprove2 = await req('POST', `/journals/${draft.id}/post`, { token: checkerToken });
ok('checker KHÔNG được ghi sổ (RBAC)', posterApprove2.status === 403, `status ${posterApprove2.status}`);

const posted = await req('POST', `/journals/${draft.id}/post`, { token: posterToken });
ok('poster ghi sổ bút toán', posted.status === 200 || posted.status === 201, `status ${posted.status}`);
ok('trạng thái = posted', posted.data?.status === 'posted', posted.data?.status);
ok('cấp số hiệu JE-<kỳ>-0001', posted.data?.entryNo === `JE-${periodCode}-0001`, String(posted.data?.entryNo));
ok('ghi nhận người ghi sổ', !!posted.data?.postedBy && !!posted.data?.postedAt);

const repost = await req('POST', `/journals/${draft.id}/post`, { token: posterToken });
ok('ghi sổ lần 2 là idempotent (không nhân đôi)',
  repost.status === 200 && repost.data?.entryNo === posted.data?.entryNo,
  `status ${repost.status}, entryNo ${repost.data?.entryNo}`);

// ─────────────────────────────────────────────────────────────────────────────
section('5. Số dư sổ cái & bảng cân đối (Ledger)');

const balances = await req('GET', `/fiscal-periods/${period.id}/balances`, { token: adminToken });
ok('đọc được số dư theo kỳ', balances.status === 200, `status ${balances.status}`);
const bList = balances.data ?? [];
const b111 = bList.find((b) => b.accountId === acc111.id);
const b411 = bList.find((b) => b.accountId === acc411.id);
ok('TK 111 phát sinh Nợ 100.000.000', b111?.debitTotal === '100000000.0000', b111?.debitTotal);
ok('TK 411 phát sinh Có 100.000.000', b411?.creditTotal === '100000000.0000', b411?.creditTotal);
ok('TK 111 số dư cuối Nợ 100.000.000', b111?.closingDebit === '100000000.0000', b111?.closingDebit);
ok('TK 411 số dư cuối Có 100.000.000', b411?.closingCredit === '100000000.0000', b411?.closingCredit);

const sumDebit = bList.reduce((s, b) => s + Number(b.debitTotal), 0);
const sumCredit = bList.reduce((s, b) => s + Number(b.creditTotal), 0);
ok('tổng Nợ = tổng Có trên sổ cái', Math.abs(sumDebit - sumCredit) < 1e-9, `${sumDebit} vs ${sumCredit}`);

// ─────────────────────────────────────────────────────────────────────────────
section('6. Đảo bút toán (reversal) — số dư phải trở về 0');

// Bút toán #2: doanh thu 5.000.000
const j2 = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-20',
    description: 'Doanh thu bán hàng thu tiền mặt',
    lines: [
      { accountId: acc111.id, debit: '5000000' },
      { accountId: acc511.id, credit: '5000000' },
    ],
  },
});
await req('POST', `/journals/${j2.data.id}/approve`, { token: checkerToken });
const j2posted = await req('POST', `/journals/${j2.data.id}/post`, { token: posterToken });
ok('ghi sổ bút toán #2 → số hiệu ...-0002', j2posted.data?.entryNo === `JE-${periodCode}-0002`, String(j2posted.data?.entryNo));

const makerReverse = await req('POST', `/journals/${j2.data.id}/reverse`, {
  token: makerToken, body: { reason: 'Thử RBAC' },
});
ok('maker KHÔNG được đảo bút toán (RBAC)', makerReverse.status === 403, `status ${makerReverse.status}`);

const reversed = await req('POST', `/journals/${j2.data.id}/reverse`, {
  token: posterToken,
  body: { reason: 'Khách hàng hủy đơn' },
});
ok('poster đảo được bút toán', reversed.status === 200 || reversed.status === 201, `status ${reversed.status}`);
ok('bút toán đảo ở trạng thái posted', reversed.data?.status === 'posted', reversed.data?.status);
ok('bút toán đảo trỏ về bút toán gốc', reversed.data?.reversalOfEntryId === j2.data.id, String(reversed.data?.reversalOfEntryId));
ok('mô tả có lý do đảo', String(reversed.data?.description ?? '').includes('Khách hàng hủy đơn'), reversed.data?.description);

const rLines = reversed.data?.lines ?? [];
const rDebit511 = Number(rLines.find((l) => l.accountId === acc511.id)?.debit ?? 0);
const rCredit111 = Number(rLines.find((l) => l.accountId === acc111.id)?.credit ?? 0);
ok('đảo dấu Nợ/Có: TK 511 ghi Nợ, TK 111 ghi Có', rDebit511 === 5000000 && rCredit111 === 5000000,
  `Nợ 511 = ${rDebit511}, Có 111 = ${rCredit111}`);

const origAfter = await req('GET', `/journals/${j2.data.id}`, { token: adminToken });
ok('bút toán gốc chuyển sang reversed', origAfter.data?.status === 'reversed', origAfter.data?.status);
ok('bút toán gốc ghi nhận bút toán đảo', origAfter.data?.reversedByEntryId === reversed.data.id, String(origAfter.data?.reversedByEntryId));

const bal2 = await req('GET', `/fiscal-periods/${period.id}/balances`, { token: adminToken });
const b511 = (bal2.data ?? []).find((b) => b.accountId === acc511.id);
ok('TK 511 sau đảo: Nợ = Có = 5.000.000 (net 0)',
  b511?.debitTotal === '5000000.0000' && b511?.creditTotal === '5000000.0000',
  `Nợ ${b511?.debitTotal} / Có ${b511?.creditTotal}`);
ok('TK 511 số dư cuối = 0', b511?.closingDebit === '0.0000' && b511?.closingCredit === '0.0000',
  `${b511?.closingDebit} / ${b511?.closingCredit}`);

const reverseTwice = await req('POST', `/journals/${j2.data.id}/reverse`, {
  token: posterToken, body: { reason: 'Đảo lần 2' },
});
ok('chặn đảo lại bút toán đã đảo', reverseTwice.status === 400 || reverseTwice.status === 409, `status ${reverseTwice.status}`);

// ─────────────────────────────────────────────────────────────────────────────
section('7. Khóa kỳ kế toán — đóng băng MỌI bút toán (API 4)');

// Tạo sẵn một bút toán nháp TRƯỚC khi khóa để kiểm tra việc sửa/xóa sau đó.
const draftBeforeLock = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-28',
    description: 'Nháp tạo trước khi khóa kỳ',
    lines: [
      { accountId: acc111.id, debit: '2000' },
      { accountId: acc411.id, credit: '2000' },
    ],
  },
});
ok('tạo nháp trước khi khóa kỳ', draftBeforeLock.status === 201, `status ${draftBeforeLock.status}`);

const locked = await req('POST', `/fiscal-periods/${period.id}/lock`, { token: adminToken });
ok('khóa kỳ kế toán', locked.status === 200, `status ${locked.status}`);
ok('trạng thái = locked', locked.data?.status === 'locked', locked.data?.status);
ok('ghi nhận thời điểm khóa', !!locked.data?.lockedAt && !!locked.data?.lockedBy);

const postToLocked = await req('POST', '/journals', {
  token: makerToken,
  body: {
    date: '2026-01-25',
    description: 'Cố ghi vào kỳ đã khóa',
    lines: [
      { accountId: acc111.id, debit: '1000' },
      { accountId: acc411.id, credit: '1000' },
    ],
  },
});
ok('chặn LẬP NHÁP vào kỳ đã khóa', postToLocked.status === 400, `status ${postToLocked.status}`);

const updateLocked = await req('PATCH', `/journals/${draftBeforeLock.data.id}`, {
  token: makerToken, body: { description: 'Sửa khi kỳ đã khóa' },
});
ok('chặn SỬA bút toán nháp trong kỳ đã khóa', updateLocked.status === 400, `status ${updateLocked.status}`);

const deleteLocked = await req('DELETE', `/journals/${draftBeforeLock.data.id}`, { token: makerToken });
ok('chặn XÓA bút toán nháp trong kỳ đã khóa', deleteLocked.status === 400, `status ${deleteLocked.status}`);

const approveLocked = await req('POST', `/journals/${draftBeforeLock.data.id}/approve`, { token: checkerToken });
ok('checker vẫn duyệt được nháp đã có (duyệt không ghi sổ)', approveLocked.status === 200, `status ${approveLocked.status}`);

const postLocked = await req('POST', `/journals/${draftBeforeLock.data.id}/post`, { token: posterToken });
ok('chặn GHI SỔ vào kỳ đã khóa', postLocked.status === 400, `status ${postLocked.status}`);

const makerLock = await req('POST', `/fiscal-periods/${period.id}/lock`, { token: makerToken });
ok('maker KHÔNG được khóa kỳ (RBAC)', makerLock.status === 403, `status ${makerLock.status}`);

const reopened = await req('POST', `/fiscal-periods/${period.id}/open`, { token: adminToken });
ok('mở lại kỳ kế toán', reopened.status === 200, `status ${reopened.status}`);
ok('trạng thái = open', reopened.data?.status === 'open', reopened.data?.status);

// Sau khi mở lại, bút toán nháp cũ phải dùng được bình thường.
const postAfterReopen = await req('POST', `/journals/${draftBeforeLock.data.id}/post`, { token: posterToken });
ok('sau khi mở lại kỳ thì ghi sổ được', postAfterReopen.status === 200, `status ${postAfterReopen.status}`);
const postAfterReopen2 = await req('GET', `/journals/${draftBeforeLock.data.id}`, { token: adminToken });
ok('bút toán sau khi mở lại đã ghi sổ', postAfterReopen2.data?.status === 'posted', postAfterReopen2.data?.status);

// ─────────────────────────────────────────────────────────────────────────────
section('8. Kết chuyển số dư sang kỳ sau (close)');

const p2code = `2026-02-${Date.now().toString().slice(-5)}`;
const p2 = await req('POST', '/fiscal-periods', {
  token: adminToken,
  body: { code: p2code, name: 'Tháng 02/2026', startDate: '2026-02-01', endDate: '2026-02-28' },
});
ok('tạo kỳ kế toán kế tiếp', p2.status === 201, `status ${p2.status}`);

const closed = await req('POST', `/fiscal-periods/${period.id}/close`, { token: adminToken });
ok('kết chuyển & đóng kỳ', closed.status === 200, `status ${closed.status}`);
ok('trạng thái = closed', closed.data?.status === 'closed', closed.data?.status);

const bal2period = await req('GET', `/fiscal-periods/${p2.data.id}/balances`, { token: adminToken });
const carried = (bal2period.data ?? []).find((b) => b.accountId === acc111.id);
// 111 = 100.000.000 (góp vốn) + 5.000.000 (doanh thu) − 5.000.000 (đảo) + 2.000 = 100.002.000
ok('kỳ sau có số dư đầu kỳ Nợ 100.002.000', carried?.openingDebit === '100002000.0000', carried?.openingDebit);

const carried511 = (bal2period.data ?? []).find((b) => b.accountId === acc511.id);
ok('TK 511 đã triệt tiêu nên KHÔNG kết chuyển sang kỳ sau', carried511 === undefined,
  carried511 ? `vẫn còn: ${JSON.stringify(carried511)}` : 'không có dòng nào');

const openDebitSum = (bal2period.data ?? []).reduce((s, b) => s + Number(b.openingDebit), 0);
const openCreditSum = (bal2period.data ?? []).reduce((s, b) => s + Number(b.openingCredit), 0);
ok('số dư đầu kỳ sau vẫn cân: Σ Nợ = Σ Có', Math.abs(openDebitSum - openCreditSum) < 1e-9,
  `${openDebitSum} vs ${openCreditSum}`);

const closeAgain = await req('POST', `/fiscal-periods/${period.id}/close`, { token: adminToken });
ok('chặn đóng lại kỳ đã đóng', closeAgain.status === 400 || closeAgain.status === 409, `status ${closeAgain.status}`);
const reopenClosed = await req('POST', `/fiscal-periods/${period.id}/open`, { token: adminToken });
ok('kỳ đã đóng KHÔNG thể mở lại', reopenClosed.status === 400 || reopenClosed.status === 409, `status ${reopenClosed.status}`);

// ─────────────────────────────────────────────────────────────────────────────
section('9. Truy vấn & phân trang danh sách bút toán');

const listAll = await req('GET', '/journals?limit=50', { token: adminToken });
ok('đọc danh sách bút toán', listAll.status === 200, `status ${listAll.status}`);
const total = listAll.data?.total ?? (listAll.data?.items ?? listAll.data ?? []).length;
ok('có ít nhất 3 bút toán (1 posted + 1 đảo + ...)', total >= 3, `total = ${total}`);

const listPosted = await req('GET', '/journals?status=posted', { token: adminToken });
const postedItems = listPosted.data?.items ?? listPosted.data ?? [];
ok('lọc theo status=posted', postedItems.length >= 2 && postedItems.every((j) => j.status === 'posted'), `${postedItems.length} bản ghi`);

const listByAccount = await req('GET', `/journals?accountId=${acc511.id}`, { token: adminToken });
const accItems = listByAccount.data?.items ?? listByAccount.data ?? [];
ok('lọc theo accountId (511)', accItems.length >= 2, `${accItems.length} bản ghi`);

const listByPeriod = await req('GET', `/journals?periodId=${period.id}`, { token: adminToken });
ok('lọc theo periodId', listByPeriod.status === 200, `status ${listByPeriod.status}`);

const listByDate = await req('GET', '/journals?fromDate=2026-01-01&toDate=2026-01-31', { token: adminToken });
ok('lọc theo khoảng ngày', listByDate.status === 200, `status ${listByDate.status}`);

const unauth = await req('GET', '/journals');
ok('chặn truy cập không token (401)', unauth.status === 401, `status ${unauth.status}`);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(72)}`);
console.log(`KẾT QUẢ E2E: ${pass} PASS / ${fail} FAIL`);
if (failures.length) {
  console.log('Các mục thất bại:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('═'.repeat(72));
process.exit(fail > 0 ? 1 : 0);
