import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const accounts = JSON.parse(readFileSync('D:/TC_KT/.tmp/mock-accounts.json', 'utf8'))
const tree = JSON.parse(readFileSync('D:/TC_KT/.tmp/mock-tree.json', 'utf8'))
const users = JSON.parse(readFileSync('D:/TC_KT/.tmp/mock-users.json', 'utf8'))

function send(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3000')
  const path = url.pathname
  console.log(`${req.method} ${req.url}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    })
    return res.end()
  }

  if (path === '/api/accounts/tree') return send(res, 200, tree)

  if (path === '/api/accounts') {
    let list = accounts
    const type = url.searchParams.get('type')
    const isActive = url.searchParams.get('isActive')
    const search = url.searchParams.get('search')
    if (type) list = list.filter((a) => a.type === type)
    if (isActive !== null) list = list.filter((a) => String(a.isActive) === isActive)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
      )
    }
    return send(res, 200, list)
  }

  if (path === '/api/users') return send(res, 200, users)

  if (path === '/api/profile') return send(res, 200, users[0])

  send(res, 404, { statusCode: 404, message: `Mock: no handler for ${path}` })
})

server.listen(3000, '127.0.0.1', () => {
  console.log('mock backend listening on http://127.0.0.1:3000')
})
