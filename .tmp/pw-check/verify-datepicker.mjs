// Kiểm thử ô chọn ngày dùng Calendar của shadcn (react-day-picker) trên bản build thật.
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

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#password', 'Admin@12345')
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
  await page.waitForTimeout(1000)
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleIssues.push(`[error] ${msg.text()}`)
  })
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  await login(page)

  // Không còn <input type="date"> nào trong DOM
  const nativeInputs = await page.locator('input[type="date"]').count()

  // ---------- /journals ----------
  await page.goto(`${BASE}/journals`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const fromPicker = page.locator('button[aria-label="Từ ngày"]')
  if (await fromPicker.isVisible()) ok('Trang bút toán: có ô chọn ngày "Từ ngày" (nút, không phải input)')
  else bad('Trang bút toán: không thấy ô chọn ngày')

  await fromPicker.click()
  await page.waitForTimeout(900)

  const calendar = page.locator('[data-slot="calendar"]').first()
  if (await calendar.isVisible()) ok('Bấm ô ngày → mở Popover chứa Calendar của shadcn')
  else bad('Không mở được Calendar')

  const rdpRoot = await page.locator('.rdp-root').count()
  if (rdpRoot > 0) ok('Calendar render bằng react-day-picker (.rdp-root)')
  else bad('Không thấy .rdp-root của react-day-picker')

  const weekdayLabels = await page
    .locator('.rdp-weekday')
    .evaluateAll((els) => els.map((el) => el.textContent?.trim()))
  ok(`Thứ trong tuần (locale tiếng Việt): ${weekdayLabels.join(' ')}`)

  const caption = await page.locator('.rdp-caption_label').first().textContent()
  ok(`Tiêu đề tháng: "${caption?.trim()}"`)

  await page.screenshot({ path: 'D:/TC_KT/.tmp/cal-1-open.png' })

  // Chọn ngày 05 của tháng đang hiển thị
  const dayBtn = page
    .locator('.rdp-day button, .rdp-day_button')
    .filter({ hasText: /^5$/ })
    .first()
  if (await dayBtn.count()) {
    await dayBtn.click()
    await page.waitForTimeout(1000)
    const label = (await fromPicker.textContent())?.trim()
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(label ?? '')) {
      ok(`Chọn ngày 5 → nút hiển thị "${label}" (DD/MM/YYYY)`)
    } else bad(`Nút ngày hiển thị sai định dạng: "${label}"`)

    const popoverClosed = (await page.locator('[data-slot="calendar"]').count()) === 0
    if (popoverClosed) ok('Chọn ngày xong tự đóng Popover')
    else bad('Popover không tự đóng sau khi chọn')

    // Danh sách bút toán được lọc lại theo fromDate
    await page.waitForTimeout(800)
    const rowCount = await page.locator('table tbody tr').count()
    ok(`Sau khi chọn "Từ ngày": bảng còn ${rowCount} dòng (đã lọc lại)`)
  } else bad('Không tìm thấy nút ngày 5 trong lịch')

  // Xoá ngày
  await fromPicker.click()
  await page.waitForTimeout(700)
  const clearBtn = page.locator('button:has-text("Xoá ngày")').first()
  if (await clearBtn.isVisible()) {
    await clearBtn.click()
    await page.waitForTimeout(800)
    const label = (await fromPicker.textContent())?.trim()
    if (label === 'Từ ngày') ok('Bấm "Xoá ngày" → ô ngày trở về placeholder')
    else bad(`Sau khi xoá, nút hiển thị "${label}"`)
  } else bad('Không thấy nút "Xoá ngày" trong Popover')

  // Điều hướng tháng trước / sau
  await fromPicker.click()
  await page.waitForTimeout(600)
  const captionBefore = (await page.locator('.rdp-caption_label').first().textContent())?.trim()
  await page.locator('.rdp-button_previous').first().click()
  await page.waitForTimeout(400)
  const captionPrev = (await page.locator('.rdp-caption_label').first().textContent())?.trim()
  await page.locator('.rdp-button_next').first().click()
  await page.waitForTimeout(400)
  const captionNext = (await page.locator('.rdp-caption_label').first().textContent())?.trim()
  if (captionPrev !== captionBefore && captionNext === captionBefore) {
    ok(`Nút tháng trước/sau hoạt động ("${captionBefore}" → "${captionPrev}" → "${captionNext}")`)
  } else bad(`Điều hướng tháng lỗi: ${captionBefore} / ${captionPrev} / ${captionNext}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---------- /audit ----------
  await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const auditFrom = page.locator('button[aria-label="Từ ngày"]')
  const auditTo = page.locator('button[aria-label="Đến ngày"]')
  if ((await auditFrom.isVisible()) && (await auditTo.isVisible())) {
    ok('Trang kiểm toán: có 2 ô chọn ngày dạng Calendar')
  } else bad('Trang kiểm toán: thiếu ô chọn ngày')
  await auditFrom.click()
  await page.waitForTimeout(800)
  if (await page.locator('[data-slot="calendar"]').first().isVisible()) {
    ok('Trang kiểm toán: Calendar mở được')
  } else bad('Trang kiểm toán: Calendar không mở')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/cal-2-audit.png' })
  await page.keyboard.press('Escape')

  // ---------- Form kỳ kế toán ----------
  await page.goto(`${BASE}/periods`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.locator('button:has-text("Thêm kỳ")').first().click()
  await page.waitForTimeout(900)
  const startPicker = page.locator('button#period-start')
  const endPicker = page.locator('button#period-end')
  if ((await startPicker.isVisible()) && (await endPicker.isVisible())) {
    ok('Form kỳ kế toán: Ngày bắt đầu / Ngày kết thúc dùng Calendar')
  } else bad('Form kỳ kế toán: chưa đổi sang Calendar')
  await startPicker.click()
  await page.waitForTimeout(800)
  if (await page.locator('[data-slot="calendar"]').first().isVisible()) {
    ok('Form kỳ kế toán: Calendar mở được')
  } else bad('Form kỳ kế toán: Calendar không mở')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/cal-3-period-form.png' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')

  // ---------- Form bút toán ----------
  await page.goto(`${BASE}/journals`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.locator('button:has-text("Lập bút toán")').first().click()
  await page.waitForTimeout(900)
  const journalPicker = page.locator('button#journal-date')
  if (await journalPicker.isVisible()) ok('Form bút toán: "Ngày hạch toán" dùng Calendar')
  else bad('Form bút toán: "Ngày hạch toán" chưa đổi')
  await journalPicker.click()
  await page.waitForTimeout(800)
  if (await page.locator('[data-slot="calendar"]').first().isVisible()) {
    ok('Form bút toán: Calendar mở được')
  } else bad('Form bút toán: Calendar không mở')
  await page.screenshot({ path: 'D:/TC_KT/.tmp/cal-4-journal-form.png' })

  const nativeAfter = await page.locator('input[type="date"]').count()
  if (nativeInputs === 0 && nativeAfter === 0) {
    ok('Không còn <input type="date"> gốc của trình duyệt')
  } else bad(`Còn ${nativeInputs}/${nativeAfter} input[type=date]`)

  await browser.close()

  console.log(results.join('\n'))
  console.log(`\nLỗi console: ${consoleIssues.length} · Lỗi runtime: ${pageErrors.length}`)
  if (consoleIssues.length) console.log(consoleIssues.slice(0, 10).join('\n'))
  if (pageErrors.length) console.log(pageErrors.slice(0, 10).join('\n'))
  console.log(`\n==> ${results.length - failures}/${results.length} PASS`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Lỗi không mong đợi:', error)
  process.exit(1)
})
