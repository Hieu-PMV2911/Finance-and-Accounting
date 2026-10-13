import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('#password', 'Admin@12345')
await page.click('button[type=submit]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })

// --- Bảng cân đối kế toán (có số liệu) ---
await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: 'Bảng cân đối kế toán' }).click()
await page.waitForTimeout(3500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-reports-bs.png', fullPage: true })

// --- Lưu chuyển tiền tệ ---
await page.getByRole('tab', { name: 'Lưu chuyển tiền tệ' }).click()
await page.waitForTimeout(3500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-reports-cf.png', fullPage: true })

// --- Sổ cái: chọn kỳ 2026-01 (nhiều phát sinh hơn) để ảnh minh hoạ rõ hơn ---
await page.goto(`${BASE}/ledger`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-ledger-gl.png', fullPage: true })

await page.getByRole('tab', { name: 'Bảng cân đối số phát sinh' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-ledger-tb.png', fullPage: true })

await page.getByRole('tab', { name: 'Đối chiếu số dư' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-ledger-rec.png', fullPage: true })

// --- Kiểm toán ---
await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-audit-logs.png', fullPage: true })

await page.getByRole('tab', { name: 'Truy vết bút toán' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'D:/TC_KT/.tmp/shot-audit-trace.png', fullPage: true })

console.log('screenshots refreshed')
await browser.close()
