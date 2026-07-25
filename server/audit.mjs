// Append-only record of the actions that change who can reach what.
//
// Scoped deliberately narrowly: account, group, membership and sharing changes,
// plus sign-ins. Form edits and responses are not logged — they are already
// visible in the product, and logging them would bury the security-relevant
// entries in noise.
//
// The actor's email is denormalised so a deleted account still reads sensibly.

import { db, now, parseJson } from './db.mjs'

export function audit(actor, action, { targetType = '', targetId = '', detail = {} } = {}) {
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor_email, action, target_type, target_id, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    now(),
    actor?.id ?? null,
    actor?.email ?? 'system',
    action,
    targetType,
    targetId,
    JSON.stringify(detail),
  )
}

export function readAuditLog({ limit = 200, before } = {}) {
  const rows = before
    ? db
        .prepare('SELECT * FROM audit_log WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?')
        .all(before, limit)
    : db.prepare('SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT ?').all(limit)

  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: parseJson(row.detail_json, {}),
  }))
}
