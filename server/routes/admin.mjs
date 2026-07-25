// Instance administration: accounts, invitations and the audit log.
//
// Everything here is system-admin only. Group membership is managed separately
// in routes/groups.mjs, because a group manager can do that without being an
// administrator of the whole instance.

import { Router } from 'express'
import { db, now } from '../db.mjs'
import { destroyAllSessions, requireAuth, setPassword } from '../auth.mjs'
import { allGroups, GROUP_ROLES, requireAdmin } from '../permissions.mjs'
import { createInvite, findInvite, listInvites, revokeInvite } from '../invites.mjs'
import { audit, readAuditLog } from '../audit.mjs'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10

/**
 * An instance with no active administrator cannot be recovered through the UI,
 * so every route that could remove the last one calls this first.
 */
function wouldStrandInstance(userId) {
  const otherAdmins = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id != ?")
    .get(userId).n
  return otherAdmins === 0
}

function userRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    groups: db
      .prepare(
        `SELECT g.id, g.name, gm.role
           FROM group_members gm JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = ?
          ORDER BY g.name COLLATE NOCASE`,
      )
      .all(row.id)
      .map((g) => ({ id: g.id, name: g.name, role: g.role })),
    formCount: db.prepare('SELECT COUNT(*) AS n FROM forms WHERE user_id = ?').get(row.id).n,
    activeSessions: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(row.id).n,
  }
}

// --- Users ------------------------------------------------------------------

adminRouter.get('/users', (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all()
  res.json({ users: rows.map(userRow), groups: allGroups() })
})

adminRouter.patch('/users/:userId', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId)
  if (!target) return res.status(404).json({ error: 'User not found' })

  const changes = {}
  const role = req.body?.role
  const status = req.body?.status
  const name = req.body?.name

  if (role !== undefined) {
    if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Unknown role.' })
    if (target.role === 'admin' && role !== 'admin' && wouldStrandInstance(target.id))
      return res.status(409).json({ error: 'This is the only administrator. Promote someone else first.' })
    changes.role = role
  }

  if (status !== undefined) {
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Unknown status.' })
    if (target.role === 'admin' && status !== 'active' && wouldStrandInstance(target.id))
      return res.status(409).json({ error: 'This is the only administrator. Promote someone else first.' })
    changes.status = status
  }

  if (name !== undefined) changes.name = String(name).trim().slice(0, 120)

  if (!Object.keys(changes).length) return res.status(400).json({ error: 'Nothing to change.' })

  const columns = Object.keys(changes)
  db.prepare(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...columns.map((c) => changes[c]),
    target.id,
  )

  // Suspension has to take hold now, not whenever their cookie happens to
  // expire. Demotion likewise: their session caches nothing, but any in-flight
  // admin page should be forced to re-authenticate its assumptions.
  if (changes.status === 'suspended') destroyAllSessions(target.id)

  audit(req.user, 'user.updated', { targetType: 'user', targetId: target.id, detail: { email: target.email, ...changes } })
  res.json({ user: userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)) })
})

adminRouter.post('/users/:userId/password', async (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId)
  if (!target) return res.status(404).json({ error: 'User not found' })

  const password = String(req.body?.password || '')
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` })

  await setPassword(target.id, password)
  // An administrator resetting a password is the response to a lost or
  // compromised account, so every existing session for it must go.
  destroyAllSessions(target.id)
  audit(req.user, 'user.password_reset', { targetType: 'user', targetId: target.id, detail: { email: target.email } })
  res.json({ ok: true })
})

adminRouter.post('/users/:userId/revoke-sessions', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId)
  if (!target) return res.status(404).json({ error: 'User not found' })
  destroyAllSessions(target.id)
  audit(req.user, 'user.sessions_revoked', { targetType: 'user', targetId: target.id, detail: { email: target.email } })
  res.json({ ok: true })
})

adminRouter.delete('/users/:userId', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id)
    return res.status(409).json({ error: 'You cannot delete your own account.' })
  if (target.role === 'admin' && wouldStrandInstance(target.id))
    return res.status(409).json({ error: 'This is the only administrator. Promote someone else first.' })

  // Forms survive: they belong to a group, not to a person. The schema sets
  // forms.user_id to NULL, leaving the form in place for the group to pick up.
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id)
  audit(req.user, 'user.deleted', { targetType: 'user', targetId: target.id, detail: { email: target.email } })
  res.json({ ok: true })
})

// --- Invitations ------------------------------------------------------------

adminRouter.get('/invites', (_req, res) => {
  res.json({ invites: listInvites() })
})

adminRouter.post('/invites', (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim()
  const role = req.body?.role === 'admin' ? 'admin' : 'member'
  const groupId = req.body?.groupId ? String(req.body.groupId) : null
  const groupRole = GROUP_ROLES.includes(req.body?.groupRole) ? req.body.groupRole : 'editor'

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Someone with that email already has an account.' })
  if (groupId && !db.prepare('SELECT 1 FROM groups WHERE id = ?').get(groupId))
    return res.status(400).json({ error: 'That group no longer exists.' })

  // Supersede any earlier unredeemed invite for the same address, so a reissued
  // link cannot be shadowed by a stale one still sitting in someone's inbox.
  db.prepare('DELETE FROM invites WHERE email = ? AND accepted_at IS NULL').run(email)

  const invite = createInvite({ email, role, groupId, groupRole, createdBy: req.user.id })
  audit(req.user, 'invite.created', {
    targetType: 'invite',
    targetId: invite.token.slice(0, 8),
    detail: { email, role, groupId, groupRole },
  })
  res.status(201).json({ invite })
})

adminRouter.delete('/invites/:token', (req, res) => {
  const invite = findInvite(req.params.token)
  if (!invite) return res.status(404).json({ error: 'Invitation not found' })
  if (invite.acceptedAt) return res.status(409).json({ error: 'That invitation has already been used.' })

  revokeInvite(invite.token)
  audit(req.user, 'invite.revoked', {
    targetType: 'invite',
    targetId: invite.token.slice(0, 8),
    detail: { email: invite.email },
  })
  res.json({ ok: true })
})

// --- Audit log --------------------------------------------------------------

adminRouter.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500)
  res.json({ entries: readAuditLog({ limit, before: req.query.before ? String(req.query.before) : undefined }) })
})

// --- Instance overview ------------------------------------------------------

adminRouter.get('/overview', (_req, res) => {
  const count = (sql, ...args) => db.prepare(sql).get(...args).n
  res.json({
    users: count('SELECT COUNT(*) AS n FROM users'),
    admins: count("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'"),
    suspended: count("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
    groups: count('SELECT COUNT(*) AS n FROM groups'),
    forms: count('SELECT COUNT(*) AS n FROM forms'),
    openForms: count("SELECT COUNT(*) AS n FROM forms WHERE access = 'link' AND published = 1"),
    pendingInvites: count("SELECT COUNT(*) AS n FROM invites WHERE accepted_at IS NULL AND expires_at > ?", now()),
    responses: count('SELECT COUNT(*) AS n FROM responses'),
  })
})
