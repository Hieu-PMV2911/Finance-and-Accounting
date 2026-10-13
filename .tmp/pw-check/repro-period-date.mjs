// Tái hiện lỗi chọn ngày trong popup "Thêm kỳ kế toán".
import { chromium } from 'playwright-core'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:4173'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const main = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[console.${msg.type()}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => console.log(`[pageerror] ${String(err)}`))

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#password', 'Admin@12345')
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })

  await page.goto(`${BASE}/periods`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.locator('button:has-text("Thêm kỳ")').first().click()
  await page.waitForTimeout(800)

  console.log('--- Dialog mở ---')
  const startPicker = page.locator('button#period-start')
  await startPicker.click()
  await page.waitForTimeout(800)

  const cal = page.locator('[data-slot="calendar"]').first()
  console.log('calendar visible:', await cal.isVisible())

  // Kiểm tra pointer-events của popover content và dialog
  const pe = await page.evaluate(() => {
    const pop = document.querySelector('[data-slot="popover-content"]')
    const dlg = document.querySelector('[data-slot="dialog-content"]')
    const day = document.querySelector('.rdp-day_button')
    const cs = (el) => (el ? getComputedStyle(el).pointerEvents : 'N/A')
    return {
      popoverPE: cs(pop),
      dialogPE: cs(dlg),
      dayPE: cs(day),
      bodyPE: getComputedStyle(document.body).pointerEvents,
      dayRect: day ? JSON.stringify(day.getBoundingClientRect()) : null,
      topElAtDay: day
        ? (() => {
            const r = day.getBoundingClientRect()
            const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return el ? `${el.tagName}.${el.className}`.slice(0, 120) : null
          })()
        : null,
    }
  })
  console.log('pointer-events:', JSON.stringify(pe, null, 2))

  // Thử bấm ngày 15
  const dayBtn = page
    .locator('.rdp-day_button')
    .filter({ hasText: /^15$/ })
    .first()
  console.log('day 15 count:', await dayBtn.count())
  await dayBtn.click({ timeout: 5000 }).catch((e) => console.log('CLICK LỖI:', e.message))
  await page.waitForTimeout(1200)

  console.log('--- Sau khi bấm ngày 15 ---')
  console.log('nút period-start:', (await startPicker.textContent())?.trim())
  console.log('dialog còn mở?', await page.locator('[data-slot="dialog-content"]').first().isVisible().catch(() => false))
  console.log('calendar còn mở?', (await page.locator('[data-slot="calendar"]').count()) > 0)

  const errAlert = await page.locator('[data-slot="dialog-content"] [role="alert"]').count()
  console.log('alert lỗi trong dialog:', errAlert)

  await page.screenshot({ path: 'D:/TC_KT/.tmp/repro-period-date.png' })

  // Thử bấm nút Lưu xem có lỗi validate không
  await page.locator('button:has-text("Lưu")').first().click().catch(() => {})
  await page.waitForTimeout(1500)
  const alertText = await page
    .locator('[data-slot="dialog-content"] [role="alert"]')
    .first()
    .textContent()
    .catch(() => null)
  console.log('alert sau khi Lưu:', alertText)
  await page.screenshot({ path: 'D:/TC_KT/.tmp/repro-period-date-2.png' })

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
