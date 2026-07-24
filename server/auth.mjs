// Accounts and sessions.
//
// Passwords are hashed with scrypt from node:crypto — no native bcrypt build,
// and scrypt is memory-hard, so it resists GPU cracking. Sessions are opaque
// random tokens stored in the database and handed out in an httpOnly cookie,
// which means signing out actually revokes access (unlike a stateless JWT).

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db, newId, now } from './db.mjs'

const scryptAsync = promisify(scrypt)

const KEY_LENGTH = 64
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const COOKIE_NAME = 'ff_session'
const SESSION_DAYS = Number(process.env.FORMFLOW_SESSION_TTL_DAYS || 30)

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS)
  return `scrypt$${SCRYPT_PARAMS.N}$${salt}$${key.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [scheme, n, salt, hex] = String(stored).split('$')
  if (scheme !== 'scrypt' || !salt || !hex) return false
  const key = await scryptAsync(password, salt, KEY_LENGTH, { ...SCRYPT_PARAMS, N: Number(n) })
  const expected = Buffer.from(hex, 'hex')
  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// --- Sessions ---------------------------------------------------------------

export function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString()
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now(),
    expires,
  )
  return { token, expires }
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function userForToken(token) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .get(token)
  if (!row) return null
  if (new Date(row.expires_at) < new Date()) {
    destroySession(token)
    return null
  }
  return { id: row.id, email: row.email, name: row.name }
}

export function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Only mark Secure when the request actually arrived over HTTPS, otherwise
    // sign-in silently fails on a plain-HTTP LAN deployment.
    secure: process.env.FORMFLOW_SECURE_COOKIES === 'true' || res.req.secure,
    expires: new Date(expires),
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export function readSessionCookie(req) {
  return req.cookies?.[COOKIE_NAME] || null
}

/** Populates req.user when a valid session cookie is present. Never rejects. */
export function attachUser(req, _res, next) {
  req.sessionToken = readSessionCookie(req)
  req.user = userForToken(req.sessionToken)
  next()
}

/** Guards routes that need a signed-in owner. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  next()
}

/** Housekeeping: drop expired sessions so the table does not grow forever. */
export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now())
}

export function createUser({ email, name, passwordHash }) {
  const id = newId()
  db.prepare(
    'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, email, name, passwordHash, now())
  return { id, email, name }
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim())
}
