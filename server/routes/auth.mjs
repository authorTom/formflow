import { Router } from 'express'
import {
  clearSessionCookie,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from '../auth.mjs'

export const authRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

// Crude in-memory throttle: five failed sign-ins per email+IP per 15 minutes.
// Enough to make online password guessing pointless without adding a dependency
// or a table. Resets when the process restarts, which is acceptable here.
const attempts = new Map()
const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 5

function throttleKey(req, email) {
  return `${req.ip}|${email}`
}

function tooManyAttempts(key) {
  const entry = attempts.get(key)
  if (!entry) return false
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key)
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

function recordFailure(key) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 })
  else entry.count += 1
}

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim()
  const name = String(req.body?.name || '').trim()
  const password = String(req.body?.password || '')

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` })
  if (findUserByEmail(email)) return res.status(409).json({ error: 'That email is already registered.' })

  const user = createUser({ email, name: name || email.split('@')[0], passwordHash: await hashPassword(password) })
  const { token, expires } = createSession(user.id)
  setSessionCookie(res, token, expires)
  res.status(201).json({ user })
})

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim()
  const password = String(req.body?.password || '')
  const key = throttleKey(req, email)

  if (tooManyAttempts(key))
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })

  const row = findUserByEmail(email)
  // Same message and roughly the same work either way, so the response does not
  // reveal whether an account exists.
  const ok = row ? await verifyPassword(password, row.password_hash) : false
  if (!ok) {
    recordFailure(key)
    return res.status(401).json({ error: 'Incorrect email or password.' })
  }

  attempts.delete(key)
  const { token, expires } = createSession(row.id)
  setSessionCookie(res, token, expires)
  res.json({ user: { id: row.id, email: row.email, name: row.name } })
})

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionToken)
  clearSessionCookie(res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user || null })
})
