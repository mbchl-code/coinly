import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { verifyInitData } from './auth.ts'
import { BadRequest, Store } from './db.ts'

const PORT = Number(process.env.PORT ?? 3000)
const DATA_DIR = process.env.DATA_DIR ?? './data'
const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
const MAX_BODY = 2 * 1024 * 1024

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set')
  process.exit(1)
}

mkdirSync(DATA_DIR, { recursive: true })
const store = new Store(join(DATA_DIR, 'coinly.db'))

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const parts: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new BadRequest('body too large')
    parts.push(chunk as Buffer)
  }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
    if (!body || typeof body !== 'object') throw new Error()
    return body
  } catch {
    throw new BadRequest('invalid json')
  }
}

function userOf(req: IncomingMessage): number | null {
  const auth = req.headers.authorization ?? ''
  return auth.startsWith('tma ') ? verifyInitData(auth.slice(4), BOT_TOKEN) : null
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const route = `${req.method} ${(req.url ?? '').split('?')[0]}`
  if (route === 'GET /api/health') return send(res, 200, { ok: true })

  const userId = userOf(req)
  if (userId == null) return send(res, 401, { error: 'unauthorized' })

  switch (route) {
    case 'GET /api/state':
      return send(res, 200, store.snapshot(userId) ?? { empty: true })
    case 'POST /api/import': {
      const body = await readJson(req)
      const created = store.import(userId, String(body.opId ?? randomUUID()), body.state as never)
      return send(res, 200, { created })
    }
    case 'POST /api/ops': {
      const body = await readJson(req)
      store.apply(userId, body as never)
      return send(res, 200, { ok: true })
    }
    case 'PUT /api/rates': {
      const body = await readJson(req)
      store.setRates(userId, body.rates, body.ratesAt)
      return send(res, 200, { ok: true })
    }
  }
  send(res, 404, { error: 'not found' })
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (e instanceof BadRequest) return send(res, 400, { error: e.message })
    console.error(e)
    send(res, 500, { error: 'internal' })
  })
}).listen(PORT, () => console.log(`coinly api on :${PORT}`))

const backup = () => {
  try {
    const file = store.backup(join(DATA_DIR, 'backups'))
    if (file) console.log(`backup: ${file}`)
  } catch (e) {
    console.error('backup failed', e)
  }
}
// Раз в час проверяем, есть ли копия за сегодня; первая — через час после старта, а не на пустой БД
setInterval(backup, 60 * 60 * 1000)
