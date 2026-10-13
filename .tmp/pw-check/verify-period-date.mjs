// Kiểm thử popup "Thêm kỳ kế toán": chọn ngày trong Dialog + ngày thuộc kỳ khác bị vô hiệu hoá.
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
const info = (m) => results.push(`  INFO  ${m}`)
const consoleIssues = []
const pageErrors = []

const state = async (page) =>
  page.evaluate(() => ({
    dialog: document.querySelectorAll('[data-slot="dialog-content"]').length,
    calendar: document.querySelectorAll('[data-slot="calendar"]').length,
  }))

const main = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  page.on('console', (m) => {
    if (m.type() === 'error') consoleIssues.push(`[error] ${m.text()}`)
  })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#password', 'Admin@12345')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
  await page.waitForTimeout(800)

  const periods = await page.evaluate(async () => {
    const raw = localStorage.getItem('al-auth')
    const token = raw ? JSON.parse(raw)?.state?.accessToken : null
    const res = await fetch('/api/fiscal-periods', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok ? res.json() : []
  })
  info(
    `Kỳ hiện có: ${periods.map((p) => `${p.code}[${p.startDate}→${p.endDate}]`).join(' ') || '(trống)'}`,
  )
  const busy = periods[0]

  await page.goto(`${BASE}/periods`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.locator('button:has-text("Thêm kỳ")').first().click()
  await page.waitForTimeout(900)

  const startPicker = page.locator('button#period-start')
  if (!(await startPicker.isVisible())) {
    bad('Không mở được popup "Thêm kỳ kế toán"')
    await browser.close()
    console.log(results.join('\n'))
    process.exit(1)
  }
  ok('Mở popup "Thêm kỳ kế toán"')

  // ---------- 1. Chọn một ngày trống ----------
  await startPicker.click()
  await page.waitForTimeout(800)
  info(`sau khi mở lịch: ${JSON.stringify(await state(page))}`)

  const pe = await page.evaluate(() => {
    const day = document.querySelector('.rdp-day_button')
    return day ? getComputedStyle(day).pointerEvents : 'N/A'
  })
  if (pe === 'auto') ok('Ngày trên lịch bấm được trong Dialog (pointer-events: auto)')
  else bad(`pointer-events của ngày = ${pe}`)

  const freeCell = page.locator('.rdp-day:not([data-disabled="true"]) button').nth(15)
  const freeIso = await freeCell.getAttribute('data-day').catch(() => null)
  const freeLabel = (await freeCell.textContent().catch(() => null))?.trim()
  info(`ngày trống chọn thử: ${freeLabel}`)

  const before = (await startPicker.textContent())?.trim()
  await freeCell.click()
  await page.waitForTimeout(1000)
  const after = (await startPicker.textContent())?.trim()
  info(`sau khi chọn ngày trống: ${JSON.stringify(await state(page))}`)
  if (before !== after && /^\d{2}\/\d{2}\/\d{4}$/.test(after ?? '')) {
    ok(`Chọn ngày trống → giá trị cập nhật "${before}" → "${after}"`)
  } else bad(`Chọn ngày không cập nhật ("${before}" → "${after}")`)
  if ((await state(page)).dialog === 1) ok('Chọn ngày xong popup vẫn mở')
  else bad('Popup bị đóng sau khi chọn ngày')

  // ---------- 2. Ngày thuộc kỳ khác phải bị vô hiệu hoá ----------
  if (busy) {
    await startPicker.click()
    await page.waitForTimeout(800)

    // Điều hướng về đúng tháng của kỳ bị chiếm
    const targetYm = busy.startDate.slice(0, 7)
    let guard = 0
    for (;;) {
      const shownIso = await page
        .locator('.rdp-day:not(.rdp-outside) button')
        .first()
        .getAttribute('data-day')
      const [dd, mm, yyyy] = (shownIso ?? '').split('/')
      const shownYm = yyyy && mm ? `${yyyy}-${mm}` : ''
      if (shownYm === targetYm || guard > 30) break
      await page.locator(shownYm > targetYm ? '.rdp-button_previous' : '.rdp-button_next').first().click()
      await page.waitForTimeout(220)
      guard += 1
    }
    const shownIso = await page.locator('.rdp-day:not(.rdp-outside) button').first().getAttribute('data-day')
    info(`lịch đang hiển thị tháng: ${shownIso}`)

    const cell = page.locator(`.rdp-day:has(button[data-day="${busy.startDate.split('-').reverse().join('/')}"])`).first()
    const busyState = await cell.evaluate((td) => ({
      dataDisabled: td.getAttribute('data-disabled'),
      opacity: getComputedStyle(td).opacity,
      cls: td.className,
      btnDisabledAttr: td.querySelector('button')?.hasAttribute('disabled'),
      btnAriaDisabled: td.querySelector('button')?.getAttribute('aria-disabled'),
    })).catch((e) => ({ error: e.message }))
    info(`ô ngày ${busy.startDate} (kỳ ${busy.code}): ${JSON.stringify(busyState)}`)

    if (busyState.dataDisabled === 'true') {
      ok(`Ngày ${busy.startDate} thuộc kỳ ${busy.code} bị vô hiệu hoá (data-disabled=true)`)
    } else bad(`Ngày ${busy.startDate} KHÔNG bị vô hiệu hoá`)
    if (Number(busyState.opacity) < 1) ok(`Ngày bị chặn được làm mờ (opacity=${busyState.opacity})`)
    else bad(`Ngày bị chặn không mờ (opacity=${busyState.opacity})`)

    const beforeClick = (await startPicker.textContent())?.trim()
    await cell.locator('button').click({ force: true, timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(900)
    const afterClick = (await startPicker.textContent())?.trim()
    if (beforeClick === afterClick) ok('Bấm vào ngày bị chặn KHÔNG đổi giá trị')
    else bad(`Bấm ngày bị chặn vẫn đổi giá trị: "${beforeClick}" → "${afterClick}"`)

    await page.screenshot({ path: 'D:/TC_KT/.tmp/period-date-disabled.png' })

    // Đóng popover bằng cách bấm ra vùng trống trong dialog (không dùng Escape)
    await page.locator('[data-slot="dialog-header"]').first().click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(700)
    info(`sau khi đóng lịch: ${JSON.stringify(await state(page))}`)
  }

  // ---------- 3. Ô "Ngày kết thúc" ----------
  const endPicker = page.locator('button#period-end')
  if (!(await endPicker.isVisible())) {
    bad('Không còn thấy ô "Ngày kết thúc" — popup đã bị đóng nhầm')
  } else {
    await endPicker.click()
    await page.waitForTimeout(800)
    if (await page.locator('[data-slot="calendar"]').first().isVisible()) {
      ok('Ô "Ngày kết thúc" mở được Calendar')
    } else bad('Ô "Ngày kết thúc" không mở được Calendar')
    await page.locator('[data-slot="dialog-header"]').first().click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(500)
  }

  // ---------- 4. Lưu thật rồi dọn dẹp ----------
  const code = `T${Date.now().toString().slice(-6)}`
  await page.fill('input#period-code', code)
  await page.fill('input#period-name', `Kỳ kiểm thử ${code}`)

  const pickFree = async (selector, nth) => {
    await page.locator(selector).click()
    await page.waitForTimeout(700)
    const cells = page.locator('.rdp-day:not([data-disabled="true"]) button')
    const count = await cells.count()
    await cells.nth(Math.min(nth, count - 1)).click()
    await page.waitForTimeout(800)
  }
  await pickFree('button#period-start', 12)
  await pickFree('button#period-end', 20)

  const startVal = (await page.locator('button#period-start').textContent())?.trim()
  const endVal = (await page.locator('button#period-end').textContent())?.trim()
  info(`ngày đã chọn: ${startVal} → ${endVal}`)

  await page.locator('button:has-text("Lưu")').first().click()
  await page.waitForTimeout(2200)

  const toastText = await page.locator('[data-sonner-toast]').first().textContent().catch(() => null)
  const closed = (await state(page)).dialog === 0
  if (closed) ok(`Lưu kỳ thành công, popup tự đóng — toast: "${toastText ?? 'n/a'}"`)
  else {
    const alertText = await page
      .locator('[data-slot="dialog-content"] [role="alert"]')
      .first()
      .textContent()
      .catch(() => null)
    bad(`Lưu thất bại — lỗi: ${alertText}`)
  }

  const cleaned = await page.evaluate(async (codeToDelete) => {
    const raw = localStorage.getItem('al-auth')
    const token = raw ? JSON.parse(raw)?.state?.accessToken : null
    const list = await (
      await fetch('/api/fiscal-periods', { headers: { Authorization: `Bearer ${token}` } })
    ).json()
    const found = list.find((p) => p.code === codeToDelete)
    if (!found) return 'không tìm thấy'
    const res = await fetch(`/api/fiscal-periods/${found.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    return `HTTP ${res.status}`
  }, code)
  info(`dọn dẹp kỳ ${code}: ${cleaned}`)

  await browser.close()

  console.log(results.join('\n'))
  console.log(`\nLỗi console: ${consoleIssues.length} · Lỗi runtime: ${pageErrors.length}`)
  if (consoleIssues.length) console.log(consoleIssues.slice(0, 10).join('\n'))
  if (pageErrors.length) console.log(pageErrors.slice(0, 10).join('\n'))
  const checked = results.filter((r) => r.startsWith('  PASS') || r.startsWith('  FAIL')).length
  console.log(`\n==> ${checked - failures}/${checked} PASS`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Lỗi không mong đợi:', e)
  process.exit(1)
})
