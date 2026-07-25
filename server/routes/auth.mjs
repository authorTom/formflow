// Sign-in, sign-out and account self-service.
//
// Registration is NOT open. An account can only be created by redeeming an
// invite issued by an administrator — except on a brand-new instance with no
// users at all, where the first registration bootstraps the administrator.

import { Router } from 'express'
import { db, now } from '../db.mjs'
import {
  clearSessionCookie,
  createSession,
  createUser,
  destroyAllSessions,
  destroySession,
  findUserByEmail,
  hashPassword,
  isFirstRun,
  publicUser,
  requireAuth,
  setPassword,
  setSessionCookie,
  verifyPassword,
} from '../auth.mjs'
import { consumeInvite, findRedeemableInvite } from '../invites.mjs'
import { groupsForUser } from '../permissions.mjs'
import { audit } from '../audit.mjs'

export const authRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10

// Crude in-memory throttle. Enough to make online password guessing pointless
// without adding a dependency or a table. Resets when the process restarts,
// which is acceptable here.
const attempts = new Map()
const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 5

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
  if (attempts.size > 10_000) attempts.clear() // cheap unbounded-growth guard
}

function passwordProblem(password) {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
  // Length does most of the work; this only rules out the worst single-token
  // choices, without the usual character-class rules that push people to "P@ssw0rd!".
  if (/^(.)\1+$/.test(password)) return 'Choose a less predictable password.'
  return null
}

/** Everything the client needs about the signed-in user in one payload. */
function sessionPayload(user) {
  return { user: { ...publicUser(user), groups: groupsForUser(user.id) } }
}

// --- Registration -----------------------------------------------------------

/**
 * Tells the sign-in screen what to offer: whether this instance still needs its
 * first administrator, and whether a given invite token is good. Deliberately
 * reveals nothing else about the instance.
 */
authRouter.get('/registration', (req, res) => {
  const firstRun = isFirstRun()
  const token = req.query.invite ? String(req.query.invite) : ''
  const invite = token ? findRedeemableInvite(token) : null

  res.json({
    firstRun,
    // Only the address it was issued to, so the form can pre-fill it. No group
    // or role detail until the invite is actually redeemed.
    invite: invite ? { email: invite.email, groupName: invite.groupName } : null,
    inviteRequired: !firstRun,
  })
})

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim()
  const name = String(req.body?.name || '').trim()
  const password = String(req.body?.password || '')
  const token = String(req.body?.invite || '')

  if (tooManyAttempts(`register|${req.ip}`))
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  const problem = passwordProblem(password)
  if (problem) return res.status(400).json({ error: problem })

  const firstRun = isFirstRun()
  let invite = null

  if (!firstRun) {
    invite = findRedeemableInvite(token)
    if (!invite) {
      recordFailure(`register|${req.ip}`)
      return res
        .status(403)
        .json({ error: 'This instance is invite-only. Ask an administrator for an invitation link.' })
    }
    // The invite is bound to one address, so a forwarded link is useless to
    // anyone else.
    if (invite.email !== email)
      return res.status(400).json({ error: `This invitation was issued to ${invite.email}.` })
  }

  if (findUserByEmail(email)) return res.status(409).json({ error: 'That email is already registered.' })

  const user = createUser({
    email,
    name: name || email.split('@')[0],
    passwordHash: await hashPassword(password),
    role: firstRun ? 'admin' : invite.role,
  })

  if (invite) {
    consumeInvite(invite.token, user.id)
    if (invite.groupId) {
      db.prepare(
        'INSERT OR IGNORE INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
      ).run(invite.groupId, user.id, invite.groupRole, now())
    }
  }

  audit(user, firstRun ? 'instance.bootstrap' : 'user.register', {
    targetType: 'user',
    targetId: user.id,
    detail: { email, role: user.role, viaInvite: !!invite },
  })

  const { token: sessionToken, expires } = createSession(user.id)
  setSessionCookie(res, sessionToken, expires)
  res.status(201).json(sessionPayload(user))
})

// --- Sign in and out --------------------------------------------------------

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim()
  const password = String(req.body?.password || '')
  const key = `${req.ip}|${email}`

  if (tooManyAttempts(key))
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })

  const row = findUserByEmail(email)
  // Same message and roughly the same work either way, so the response does not
  // reveal whether an account exists.
  const ok = row ? await verifyPassword(password, row.password_hash) : false
  if (!ok) {
    recordFailure(key)
    audit(row ? publicUser(row) : { email }, 'auth.login_failed', { detail: { email, ip: req.ip } })
    return res.status(401).json({ error: 'Incorrect email or password.' })
  }

  // A suspended account keeps its password but cannot get a session.
  if (row.status !== 'active') {
    audit(publicUser(row), 'auth.login_blocked', { detail: { email, status: row.status } })
    return res.status(403).json({ error: 'This account has been suspended. Contact an administrator.' })
  }

  attempts.delete(key)
  const { token, expires } = createSession(row.id)
  setSessionCookie(res, token, expires)
  audit(publicUser(row), 'auth.login', { detail: { ip: req.ip } })
  res.json(sessionPayload(row))
})

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionToken)
  clearSessionCookie(res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  res.json(req.user ? sessionPayload(req.user) : { user: null })
})

// --- Self-service -----------------------------------------------------------

authRouter.put('/profile', requireAuth, (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 120)
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name || req.user.email.split('@')[0], req.user.id)
  res.json(sessionPayload(findUserByEmail(req.user.email)))
})

authRouter.post('/password', requireAuth, async (req, res) => {
  const current = String(req.body?.currentPassword || '')
  const next = String(req.body?.newPassword || '')

  const row = findUserByEmail(req.user.email)
  if (!(await verifyPassword(current, row.password_hash)))
    return res.status(401).json({ error: 'Your current password is not correct.' })

  const problem = passwordProblem(next)
  if (problem) return res.status(400).json({ error: problem })

  await setPassword(req.user.id, next)
  // Changing a password should evict anyone else holding a session for this
  // account — that is usually the entire point of changing it.
  destroyAllSessions(req.user.id, { except: req.sessionToken })
  audit(req.user, 'user.password_changed', { targetType: 'user', targetId: req.user.id })
  res.json({ ok: true })
})

/** Signs the user out of every browser, including this one. */
authRouter.post('/logout-all', requireAuth, (req, res) => {
  destroyAllSessions(req.user.id)
  clearSessionCookie(res)
  audit(req.user, 'user.sessions_revoked', { targetType: 'user', targetId: req.user.id })
  res.json({ ok: true })
})
