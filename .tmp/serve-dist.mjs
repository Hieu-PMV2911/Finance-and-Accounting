// Phục vụ thư mục Frontend/dist (SPA) và chuyển tiếp /api sang backend NestJS.
// Dùng để kiểm thử UI trên bản build thật mà không cần khởi động lại Vite dev.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const DIST = process.argv[2]
const PORT = Number(process.argv[3] ?? 4173)
const API_TARGET = { host: '127.0.0.1', port: 3000 }

if (!DIST) {
  console.error('Thiếu tham số: đường dẫn thư mục dist')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function serveIndex(res) {
  const index = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': MIME['.html'] })
  fs.createReadStream(index).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname.startsWith('/api')) {
    const proxyReq = http.request(
      {
        host: API_TARGET.host,
        port: API_TARGET.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${API_TARGET.host}:${API_TARGET.port}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )
    proxyReq.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: `Proxy lỗi: ${error.message}` }))
    })
    req.pipe(proxyReq)
    return
  }

  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(DIST, safePath)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
    })
    fs.createReadStream(filePath).pipe(res)
    return
  }

  serveIndex(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dist server: http://127.0.0.1:${PORT} -> ${DIST}`)
})
