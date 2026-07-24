// FormFlow server.
//
// One Node process serves the API and, in production, the built React bundle
// from ./dist. In development Vite serves the bundle on :5173 and proxies /api
// here, so this file behaves identically in both modes apart from the static
// handler finding nothing to serve.

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { attachUser, purgeExpiredSessions } from './auth.mjs'
import { authRouter } from './routes/auth.mjs'
import { formsRouter } from './routes/forms.mjs'
import { publicRouter } from './routes/public.mjs'
import { DATA_DIR } from './db.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8080)

const app = express()

// Behind a reverse proxy, trust X-Forwarded-* so req.ip (rate limiting) and
// req.secure (cookie Secure flag) reflect the real client connection.
if (process.env.FORMFLOW_TRUST_PROXY !== 'false') app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(express.json({ limit: '1mb' }))

// Minimal cookie parsing — the app sets exactly one cookie, so a dependency
// for this would be more code than the parser.
app.use((req, _res, next) => {
  const header = req.headers.cookie
  req.cookies = {}
  if (header) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      const key = part.slice(0, eq).trim()
      if (key) req.cookies[key] = decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  next()
})

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Public form pages are meant to be embeddable in other sites, the way any
  // hosted form embed is. Everything else is same-origin only.
  if (!req.path.startsWith('/f/')) res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  next()
})

app.use(attachUser)

app.get('/api/health', (_req, res) => res.json({ ok: true, dataDir: DATA_DIR }))
app.use('/api/auth', authRouter)
app.use('/api/forms', formsRouter)
app.use('/api/public', publicRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// --- Static bundle ----------------------------------------------------------

if (existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under /assets, so those can be cached
        // forever; index.html must never be, or upgrades never reach anyone.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )

  // SPA fallback: every non-API route renders the app and the client router
  // decides what to show.
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
} else {
  app.get('*', (_req, res) =>
    res
      .status(404)
      .type('text/plain')
      .send('No production build found. Run "npm run dev" for the dev server, or "npm run build".'),
  )
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, _req, res, _next) => {
  console.error('[formflow]', err)
  res.status(500).json({ error: 'Something went wrong.' })
})

purgeExpiredSessions()
setInterval(purgeExpiredSessions, 6 * 3600_000).unref()

app.listen(PORT, () => {
  console.log(`FormFlow listening on http://localhost:${PORT}  (data: ${DATA_DIR})`)
})
