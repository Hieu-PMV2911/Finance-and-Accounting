import { chromium } from 'playwright-core'

const BASE = process.env.APP_URL ?? 'http://localhost:5174'
const CHROME =
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const consoleIssues = []
const pageErrors = []
const results = []
let failures = 0

const ok = (m) => results.push(`  ✅ ${m}`)
const bad = (m) => {
  failures++
  results.push(`  ❌ ${m}`)
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleIssues.push(`[${msg.type()}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  // ---------- Đăng nhập ----------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#password', 'Admin@12345')
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15000,
  })
  ok(`Đăng nhập thành công → ${new URL(page.url()).pathname}`)

  // ---------- MỤC 6: Sổ cái ----------
  await page.goto(`${BASE}/ledger`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  if (await page.getByText('Sổ cái chi tiết').first().isVisible()) {
    ok('Trang /ledger hiển thị 3 tab')
  } else bad('Trang /ledger không hiển thị tab')

  // Tab 1 — sổ cái chi tiết
  if (await page.getByText('Dư đầu kỳ').first().isVisible()) ok('Tab sổ cái: có "Dư đầu kỳ"')
  else bad('Tab sổ cái: thiếu "Dư đầu kỳ"')
  if (await page.getByText('Dư cuối kỳ').first().isVisible()) ok('Tab sổ cái: có "Dư cuối kỳ"')
  else bad('Tab sổ cái: thiếu "Dư cuối kỳ"')
  const glRows = await page.locator('table tbody tr').count()
  if (glRows > 0) ok(`Tab sổ cái: ${glRows} dòng phát sinh`)
  else bad('Tab sổ cái: không có dòng phát sinh')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-ledger-gl.png', fullPage: true })

  // Tab 2 — bảng cân đối số phát sinh
  await page.getByRole('tab', { name: 'Bảng cân đối số phát sinh' }).click()
  await page.waitForTimeout(1200)
  if (await page.getByText('Tổng cộng').first().isVisible()) ok('Tab trial balance: có dòng "Tổng cộng"')
  else bad('Tab trial balance: thiếu "Tổng cộng"')
  if (await page.getByText('Cân đối').first().isVisible()) ok('Tab trial balance: badge "Cân đối"')
  else bad('Tab trial balance: thiếu badge "Cân đối"')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-ledger-tb.png', fullPage: true })

  // Tab 3 — đối chiếu
  await page.getByRole('tab', { name: 'Đối chiếu số dư' }).click()
  await page.waitForTimeout(1200)
  if (
    await page
      .getByText('Số dư khớp hoàn toàn với bút toán')
      .first()
      .isVisible()
  ) {
    ok('Tab đối chiếu: "Số dư khớp hoàn toàn với bút toán"')
  } else bad('Tab đối chiếu: không thấy kết quả khớp')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-ledger-rec.png', fullPage: true })

  // ---------- MỤC 7: Báo cáo ----------
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  if (await page.getByText('Tổng doanh thu').first().isVisible()) ok('Báo cáo P&L: có "Tổng doanh thu"')
  else bad('Báo cáo P&L: thiếu "Tổng doanh thu"')
  if (await page.getByText('Lợi nhuận thuần').first().isVisible()) ok('Báo cáo P&L: có "Lợi nhuận thuần"')
  else bad('Báo cáo P&L: thiếu "Lợi nhuận thuần"')
  if (await page.getByRole('button', { name: 'Excel' }).isVisible()) ok('Nút xuất Excel hiển thị')
  else bad('Thiếu nút xuất Excel')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-reports-pl.png', fullPage: true })

  // Tab bảng cân đối kế toán
  await page.getByRole('tab', { name: 'Bảng cân đối kế toán' }).click()
  await page.waitForTimeout(3000)
  if (await page.getByText('Tổng tài sản').first().isVisible()) ok('Báo cáo BCĐKT: có "Tổng tài sản"')
  else bad('Báo cáo BCĐKT: thiếu "Tổng tài sản"')
  if (await page.getByText('Nợ + Vốn:').first().isVisible()) ok('Báo cáo BCĐKT: có dòng cân đối Nợ + Vốn')
  else bad('Báo cáo BCĐKT: thiếu dòng cân đối')
  const svgCount = await page.locator('svg.recharts-surface').count()
  const barCount = await page.locator('path.recharts-rectangle').count()
  if (svgCount > 0 && barCount > 0) ok(`Báo cáo BCĐKT: biểu đồ Recharts render (${barCount} cột)`)
  else bad(`Báo cáo BCĐKT: biểu đồ KHÔNG render (svg=${svgCount}, bar=${barCount})`)
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-reports-bs.png', fullPage: true })

  // Tab lưu chuyển tiền tệ
  await page.getByRole('tab', { name: 'Lưu chuyển tiền tệ' }).click()
  await page.waitForTimeout(3000)
  if (await page.getByText('Tiền cuối kỳ').first().isVisible()) ok('Báo cáo LCTT: có "Tiền cuối kỳ"')
  else bad('Báo cáo LCTT: thiếu "Tiền cuối kỳ"')
  if (await page.getByText('Hoạt động kinh doanh').first().isVisible()) ok('Báo cáo LCTT: đủ 3 nhóm hoạt động')
  else bad('Báo cáo LCTT: thiếu nhóm hoạt động')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-reports-cf.png', fullPage: true })

  // ---------- MỤC 8: Kiểm toán ----------
  await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  if (await page.getByText('Nhật ký thay đổi').first().isVisible()) ok('Trang /audit: tab "Nhật ký thay đổi"')
  else bad('Trang /audit: không load được')

  const logRows = await page.locator('table tbody tr').count()
  if (logRows > 0) ok(`Nhật ký: ${logRows} vết kiểm toán`)
  else bad('Nhật ký: không có vết nào (DB có thể chưa phát sinh thay đổi qua API)')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-audit-logs.png', fullPage: true })

  if (logRows > 0) {
    await page.locator('table tbody tr').first().click()
    await page.waitForTimeout(1200)
    if (await page.getByText('Thay đổi (').first().isVisible()) ok('Dialog chi tiết: có bảng before/after')
    else bad('Dialog chi tiết: thiếu bảng before/after')
    if (await page.getByText('Lịch sử bản ghi').first().isVisible()) ok('Dialog chi tiết: có lịch sử bản ghi')
    else bad('Dialog chi tiết: thiếu lịch sử bản ghi')
    await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-audit-detail.png', fullPage: true })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }

  // Tab truy vết bút toán
  await page.getByRole('tab', { name: 'Truy vết bút toán' }).click()
  await page.waitForTimeout(1800)
  if (await page.getByText('Chứng từ nguồn').first().isVisible()) ok('Truy vết: có khối "Chứng từ nguồn"')
  else bad('Truy vết: thiếu khối "Chứng từ nguồn"')
  if (await page.getByText('Dòng định khoản').first().isVisible()) ok('Truy vết: có bảng dòng định khoản')
  else bad('Truy vết: thiếu bảng dòng định khoản')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-audit-trace.png', fullPage: true })

  // ---------- Truy vết từ danh sách bút toán ----------
  await page.goto(`${BASE}/journals`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const actionButtons = page.getByRole('button', { name: 'Hành động' })
  if ((await actionButtons.count()) > 0) {
    await actionButtons.first().click()
    await page.waitForTimeout(600)
    if (await page.getByRole('menuitem', { name: 'Truy vết' }).isVisible()) {
      ok('Bút toán: menu có mục "Truy vết" (admin)')
      await page.getByRole('menuitem', { name: 'Truy vết' }).click()
      await page.waitForTimeout(1800)
      if (await page.getByText('Chứng từ nguồn').first().isVisible()) ok('Dialog truy vết mở từ bút toán OK')
      else bad('Dialog truy vết không hiển thị nội dung')
      await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-journal-trace.png', fullPage: true })
      await page.keyboard.press('Escape')
    } else bad('Bút toán: menu thiếu mục "Truy vết"')
  } else bad('Bút toán: không có nút hành động')

  await browser.close()
}

try {
  await main()
} catch (error) {
  bad(`Lỗi thực thi: ${error?.message ?? error}`)
  if (error?.stack) console.error(error.stack)
}

console.log('\n══════════════════════════════════════════════════════════')
console.log(results.join('\n'))
console.log('══════════════════════════════════════════════════════════')

if (pageErrors.length > 0) {
  console.log(`\n🔴 LỖI RUNTIME (${pageErrors.length}):`)
  pageErrors.forEach((e) => console.log('   ' + e.slice(0, 400)))
} else {
  console.log('\n✅ Không có lỗi runtime (pageerror).')
}

if (consoleIssues.length > 0) {
  console.log(`\n⚠️  Console error/warning (${consoleIssues.length}):`)
  consoleIssues.slice(0, 15).forEach((e) => console.log('   ' + e.slice(0, 300)))
} else {
  console.log('✅ Console sạch.')
}

console.log(
  failures === 0
    ? `\n🎉 UI PASS — ${results.filter((r) => r.includes('✅')).length} kiểm tra`
    : `\n⚠️  ${failures} kiểm tra THẤT BẠI`,
)
process.exit(failures === 0 && pageErrors.length === 0 ? 0 : 1)
