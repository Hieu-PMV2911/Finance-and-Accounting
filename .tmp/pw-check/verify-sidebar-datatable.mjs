// Kiểm thử UI sidebar (shadcn) + DataTable phân trang 10 dòng trên bản build thật.
import { chromium } from 'playwright-core'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:4173'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const results = []
let failures = 0
const ok = (m) => results.push(`  PASS  ${m}`)
const bad = (m) => {
  failures++
  results.push(`  FAIL  ${m}`)
}

const consoleIssues = []
const pageErrors = []

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleIssues.push(`[error] ${msg.text()}`)
  })
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  // ---------- Đăng nhập ----------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#password', 'Admin@12345')
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
  ok(`Đăng nhập thành công → ${new URL(page.url()).pathname}`)

  await page.waitForTimeout(1200)

  // ---------- SIDEBAR (shadcn) ----------
  const sidebar = page.locator('[data-slot="sidebar"]').first()
  if (await sidebar.isVisible()) ok('Sidebar shadcn hiển thị ([data-slot=sidebar])')
  else bad('Không thấy sidebar shadcn')

  const navGroups = await page.locator('[data-sidebar="group-label"]').count()
  if (navGroups >= 3) ok(`Sidebar có ${navGroups} nhóm menu (Kế toán/Danh mục/Quản trị)`)
  else bad(`Sidebar chỉ có ${navGroups} nhóm menu`)

  const menuItems = await page.locator('[data-sidebar="menu-button"]').count()
  if (menuItems >= 8) ok(`Sidebar có ${menuItems} mục menu`)
  else bad(`Sidebar chỉ có ${menuItems} mục menu`)

  if (await page.locator('[data-sidebar="rail"]').count()) ok('Có thanh kéo SidebarRail')
  else bad('Thiếu SidebarRail')

  const trigger = page.locator('[data-sidebar="trigger"]').first()
  if (await trigger.isVisible()) ok('Có nút thu gọn sidebar (SidebarTrigger)')
  else bad('Thiếu SidebarTrigger')

  await page.screenshot({ path: 'D:/TC_KT/.tmp/side-1-expanded.png' })

  // Thu gọn → chỉ còn icon, hiện tooltip
  const widthBefore = (await sidebar.boundingBox())?.width ?? 0
  await trigger.click()
  await page.waitForTimeout(500)
  const state = await page
    .locator('[data-slot="sidebar"][data-state]')
    .first()
    .getAttribute('data-state')
  const widthAfter = (await page.locator('[data-slot="sidebar-container"]').first().boundingBox())?.width ?? 0
  if (state === 'collapsed' && widthAfter < widthBefore) {
    ok(`Thu gọn sidebar OK (${Math.round(widthBefore)}px → ${Math.round(widthAfter)}px)`)
  } else bad(`Thu gọn sidebar lỗi (state=${state}, ${widthBefore} → ${widthAfter})`)
  await page.screenshot({ path: 'D:/TC_KT/.tmp/side-2-collapsed.png' })

  // Hover icon khi thu gọn → tooltip (chọn mục menu điều hướng, không phải logo/người dùng)
  const firstItem = page.locator('[data-sidebar="menu-button"]').nth(1)
  await firstItem.hover()
  await page.waitForTimeout(900)
  const tooltipVisible = await page
    .locator('[data-slot="tooltip-content"]')
    .first()
    .isVisible()
    .catch(() => false)
  if (tooltipVisible) ok('Thu gọn: hover icon hiện tooltip tên mục')
  else bad('Thu gọn: không thấy tooltip khi hover')

  // Mở lại
  await trigger.click()
  await page.waitForTimeout(400)
  const stateBack = await page
    .locator('[data-slot="sidebar"][data-state]')
    .first()
    .getAttribute('data-state')
  if (stateBack === 'expanded') ok('Mở lại sidebar OK')
  else bad(`Mở lại sidebar lỗi (state=${stateBack})`)

  // ---------- DATATABLE + PHÂN TRANG 10 ----------
  await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)

  const rowCount = await page.locator('table tbody tr').count()
  if (rowCount === 10) ok(`Bảng kiểm toán: đúng 10 dòng/trang (có ${rowCount})`)
  else bad(`Bảng kiểm toán: ${rowCount} dòng (mong đợi 10)`)

  const summary = await page.locator('text=/Hiển thị .* trên .* dòng/').first().textContent()
  ok(`Thống kê chân bảng: "${summary?.replace(/\s+/g, ' ').trim()}"`)

  const pageButtons = page.locator('button[aria-label^="Trang "]')
  const pageCount = await pageButtons.count()
  if (pageCount >= 3) ok(`Có ${pageCount} nút số trang ở chân bảng`)
  else bad(`Chỉ có ${pageCount} nút số trang`)

  const labels = await pageButtons.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label')),
  )
  ok(`Nhãn nút trang: ${labels.join(', ')}`)

  const firstRowBefore = await page.locator('table tbody tr').first().innerText()

  // Bấm sang trang 2
  await page.locator('button[aria-label="Trang 2"]').click()
  await page.waitForTimeout(600)
  const firstRowAfter = await page.locator('table tbody tr').first().innerText()
  const summary2 = await page.locator('text=/Hiển thị .* trên .* dòng/').first().textContent()
  if (firstRowBefore !== firstRowAfter) ok('Bấm "Trang 2": nội dung bảng đổi sang dữ liệu khác')
  else bad('Bấm "Trang 2": bảng không đổi dữ liệu')
  ok(`Thống kê trang 2: "${summary2?.replace(/\s+/g, ' ').trim()}"`)

  const activePage2 = await page
    .locator('button[aria-label="Trang 2"]')
    .getAttribute('aria-current')
  if (activePage2 === 'page') ok('Nút "Trang 2" được đánh dấu aria-current=page')
  else bad(`Nút "Trang 2" không được đánh dấu (aria-current=${activePage2})`)

  await page.screenshot({ path: 'D:/TC_KT/.tmp/dt-1-audit-page2.png' })

  // Bấm trang cuối
  const lastLabel = labels[labels.length - 1]
  const lastIndex = Number(lastLabel.replace('Trang ', ''))
  await page.locator(`button[aria-label="${lastLabel}"]`).click()
  await page.waitForTimeout(600)
  const rowsLast = await page.locator('table tbody tr').count()
  ok(`Bấm "${lastLabel}" (trang cuối): ${rowsLast} dòng`)

  const nextDisabled = await page
    .locator('button[aria-label="Trang sau"]')
    .isDisabled()
  if (nextDisabled) ok('Ở trang cuối: nút "Trang sau" bị vô hiệu hoá')
  else bad('Ở trang cuối: nút "Trang sau" vẫn bấm được')

  // Nhấn một dòng → mở dialog chi tiết (onRowClick)
  await page.locator('table tbody tr').first().click()
  await page.waitForTimeout(900)
  const dialogOpen = await page.locator('[data-slot="dialog-content"]').first().isVisible()
  if (dialogOpen) ok('Nhấn một dòng mở dialog chi tiết (onRowClick)')
  else bad('Nhấn dòng không mở dialog')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---------- Sắp xếp theo cột ----------
  await page.locator('button:has-text("Thời điểm")').first().click()
  await page.waitForTimeout(500)
  ok('Bấm tiêu đề cột "Thời điểm" để sắp xếp — không lỗi')

  // ---------- Trang Tài khoản (chế độ Bảng) ----------
  await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.getByRole('tab', { name: 'Bảng' }).click()
  await page.waitForTimeout(1500)
  const accRows = await page.locator('table tbody tr').count()
  if (accRows <= 10) ok(`Tài khoản (chế độ Bảng): ${accRows} dòng/trang (tối đa 10)`)
  else bad(`Tài khoản (chế độ Bảng): ${accRows} dòng (vượt 10)`)
  const accSummary = await page
    .locator('text=/Hiển thị .* trên .* dòng/')
    .first()
    .textContent()
  ok(`Tài khoản: "${accSummary?.replace(/\s+/g, ' ').trim()}"`)
  await page.screenshot({ path: 'D:/TC_KT/.tmp/dt-2-accounts.png' })

  // ---------- Trang Người dùng ----------
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const userRows = await page.locator('table tbody tr').count()
  ok(`Người dùng: ${userRows} dòng hiển thị`)

  // ---------- Trang Bút toán ----------
  await page.goto(`${BASE}/journals`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const jRows = await page.locator('table tbody tr').count()
  ok(`Bút toán: ${jRows} dòng hiển thị`)

  // Cột "Số tiền" phải căn phải: cạnh phải của ô số ≈ cạnh phải của ô header
  const align = await page.evaluate(() => {
    const table = document.querySelector('table')
    if (!table) return null
    const heads = [...table.querySelectorAll('thead th')]
    const headIndex = heads.findIndex((th) =>
      (th.textContent ?? '').toUpperCase().includes('SỐ TIỀN'),
    )
    if (headIndex < 0) return null
    const headRect = heads[headIndex].getBoundingClientRect()
    const cell = table.querySelectorAll('tbody tr')[0]?.children[headIndex]
    if (!cell) return null
    const valueRect = cell.getBoundingClientRect()
    const inner = cell.firstElementChild?.getBoundingClientRect() ?? valueRect
    return {
      headRight: headRect.right,
      cellRight: valueRect.right,
      valueRight: inner.right,
    }
  })
  if (align && Math.abs(align.valueRight - align.cellRight) < 16) {
    ok(
      `Cột "Số tiền" căn phải (lệch ${(align.cellRight - align.valueRight).toFixed(1)}px)`,
    )
  } else bad(`Cột "Số tiền" chưa căn phải: ${JSON.stringify(align)}`)

  // Mô tả dài phải bị cắt bằng "…" chứ không tràn sang cột bên cạnh
  const overflow = await page.evaluate(() => {
    const table = document.querySelector('table')
    const cell = table?.querySelector('tbody tr td:nth-child(3)')
    const button = cell?.querySelector('button')
    if (!cell || !button) return null
    const cellRect = cell.getBoundingClientRect()
    const btnRect = button.getBoundingClientRect()
    return { overflow: btnRect.right - cellRect.right, cellWidth: cellRect.width }
  })
  if (overflow && overflow.overflow <= 1) {
    ok('Cột "Diễn giải": nội dung dài bị cắt gọn trong ô (không tràn)')
  } else bad(`Cột "Diễn giải" tràn ${overflow?.overflow?.toFixed(1)}px`)

  await page.screenshot({ path: 'D:/TC_KT/.tmp/dt-3-journals.png' })

  // ---------- Trang Kỳ kế toán ----------
  await page.goto(`${BASE}/periods`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const pRows = await page.locator('table tbody tr').count()
  ok(`Kỳ kế toán: ${pRows} dòng hiển thị`)

  // ---------- Mobile: sidebar mở bằng Sheet ----------
  const mobile = await browser.newPage({
    viewport: { width: 420, height: 800 },
    isMobile: false,
  })
  await mobile.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await mobile.fill('#password', 'Admin@12345')
  await mobile.click('button[type=submit]')
  await mobile.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
  await mobile.waitForTimeout(1000)
  await mobile.locator('[data-sidebar="trigger"]').first().click()
  await mobile.waitForTimeout(900)
  const sheetVisible = await mobile
    .locator('[data-slot="sidebar"][data-mobile="true"]')
    .first()
    .isVisible()
    .catch(() => false)
  if (sheetVisible) ok('Mobile: sidebar mở dạng Sheet trượt')
  else bad('Mobile: không mở được sidebar dạng Sheet')
  await mobile.screenshot({ path: 'D:/TC_KT/.tmp/side-3-mobile.png' })

  await browser.close()

  console.log(results.join('\n'))
  console.log(
    `\nLỗi console: ${consoleIssues.length} · Lỗi runtime: ${pageErrors.length}`,
  )
  if (consoleIssues.length) console.log(consoleIssues.slice(0, 10).join('\n'))
  if (pageErrors.length) console.log(pageErrors.slice(0, 10).join('\n'))
  console.log(`\n==> ${results.length - failures}/${results.length} PASS`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Lỗi không mong đợi:', error)
  process.exit(1)
})
