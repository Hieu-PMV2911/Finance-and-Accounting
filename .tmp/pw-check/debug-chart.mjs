import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('#password', 'Admin@12345')
await page.click('button[type=submit]')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })

await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: 'Bảng cân đối kế toán' }).click()
await page.waitForTimeout(2500)

const info = await page.evaluate(() => {
  const svg = document.querySelector('svg.recharts-surface')
  if (!svg) return { error: 'no svg' }
  const rects = Array.from(svg.querySelectorAll('.recharts-rectangle'))
  const bars = Array.from(svg.querySelectorAll('.recharts-bar-rectangle'))
  const barLayer = svg.querySelector('.recharts-bar')
  return {
    svgSize: `${svg.getAttribute('width')}x${svg.getAttribute('height')}`,
    rectCount: rects.length,
    barRectCount: bars.length,
    barLayerClass: barLayer?.getAttribute('class') ?? null,
    barLayerFill: barLayer?.getAttribute('fill') ?? null,
    rects: rects.slice(0, 5).map((r) => ({
      tag: r.tagName,
      d: (r.getAttribute('d') ?? '').slice(0, 120),
      fillAttr: r.getAttribute('fill'),
      fillComputed: getComputedStyle(r).fill,
      width: r.getAttribute('width'),
      height: r.getAttribute('height'),
      x: r.getAttribute('x'),
    })),
    paths: Array.from(svg.querySelectorAll('path.recharts-rectangle')).length,
    allPathCount: svg.querySelectorAll('path').length,
    chart1Var: getComputedStyle(document.documentElement)
      .getPropertyValue('--chart-1')
      .trim(),
  }
})

console.log(JSON.stringify(info, null, 2))
await browser.close()
