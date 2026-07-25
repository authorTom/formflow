// Invitations.
//
// An invite is a single-use, expiring capability to create exactly one account,
// bound to the email address it was issued for. Binding to the email matters:
// the link travels through chat or mail and may be forwarded, and without the
// binding a forwarded link would be an open registration door again.
//
// There is no mail server here by design — an admin creates the invite, copies
// the link, and sends it however the organisation already communicates.

import { randomBytes } from 'node:crypto'
import { db, now } from './db.mjs'
import { GROUP_ROLES } from './permissions.mjs'

const INVITE_DAYS = Number(process.env.FORMFLOW_INVITE_TTL_DAYS || 7)

export function createInvite({ email, role = 'member', groupId = null, groupRole = 'editor', createdBy }) {
  const token = randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString()

  db.prepare(
    `INSERT INTO invites (token, email, role, group_id, group_role, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    String(email).toLowerCase().trim(),
    role === 'admin' ? 'admin' : 'member',
    groupId,
    GROUP_ROLES.includes(groupRole) ? groupRole : 'editor',
    createdBy,
    now(),
    expires,
  )

  return findInvite(token)
}

export function findInvite(token) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT i.*, g.name AS group_name
         FROM invites i LEFT JOIN groups g ON g.id = i.group_id
        WHERE i.token = ?`,
    )
    .get(String(token))
  return row ? toInvite(row) : null
}

/** An invite that may still be redeemed: never used, not past its expiry. */
export function findRedeemableInvite(token) {
  const invite = findInvite(token)
  if (!invite || invite.acceptedAt) return null
  if (new Date(invite.expiresAt) < new Date()) return null
  return invite
}

export function consumeInvite(token, userId) {
  db.prepare('UPDATE invites SET accepted_at = ?, accepted_by = ? WHERE token = ?').run(
    now(),
    userId,
    token,
  )
}

export function revokeInvite(token) {
  db.prepare('DELETE FROM invites WHERE token = ? AND accepted_at IS NULL').run(token)
}

export function listInvites() {
  return db
    .prepare(
      `SELECT i.*, g.name AS group_name
         FROM invites i LEFT JOIN groups g ON g.id = i.group_id
        ORDER BY i.created_at DESC LIMIT 200`,
    )
    .all()
    .map(toInvite)
}

/** Drops invites that expired long enough ago to be of no interest. */
export function purgeStaleInvites() {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString()
  db.prepare('DELETE FROM invites WHERE accepted_at IS NULL AND expires_at < ?').run(cutoff)
}

function toInvite(row) {
  const expired = !row.accepted_at && new Date(row.expires_at) < new Date()
  return {
    token: row.token,
    email: row.email,
    role: row.role,
    groupId: row.group_id,
    groupName: row.group_name || null,
    groupRole: row.group_role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    status: row.accepted_at ? 'accepted' : expired ? 'expired' : 'pending',
  }
}
