// Who may do what.
//
// Two independent axes:
//
//   System role   admin  — runs the instance: users, invites, every group and
//                          every form.
//                 member — ordinary user; sees only what their groups give them.
//
//   Group role    manager — adds and removes members, and fully controls the
//                           group's forms.
//                 editor  — creates and edits the group's forms.
//                 viewer  — reads results only.
//
// A form belongs to exactly one group and may additionally be shared with other
// groups as 'edit' or 'view'. A user's access to a form is the *highest* of what
// the owning group and any share grants them, capped by their role in whichever
// group granted it. Admins always get 'manage'.
//
// Every check funnels through formAccess() so there is one place to reason about
// — route handlers never assemble their own SQL for this.

import { db } from './db.mjs'

export const GROUP_ROLES = ['manager', 'editor', 'viewer']
export const SHARE_ACCESS = ['edit', 'view']

/** Ordered so a numeric comparison answers "is this at least X?". */
const ACCESS_RANK = { none: 0, view: 1, edit: 2, manage: 3 }

/** What a role in the *owning* group grants over that group's forms. */
const OWNER_ROLE_ACCESS = { manager: 'manage', editor: 'edit', viewer: 'view' }

/**
 * What a role grants over a form merely *shared* with the group. A share never
 * confers 'manage' — only the owning group can delete a form or re-share it —
 * and a viewer stays a viewer even where the share says 'edit'.
 */
const SHARED_ROLE_ACCESS = {
  edit: { manager: 'edit', editor: 'edit', viewer: 'view' },
  view: { manager: 'view', editor: 'view', viewer: 'view' },
}

export function isAdmin(user) {
  return user?.role === 'admin'
}

export function atLeast(access, required) {
  return ACCESS_RANK[access] >= ACCESS_RANK[required]
}

/** This user's role in one group, or null if they are not a member. */
export function groupRole(userId, groupId) {
  if (!userId || !groupId) return null
  const row = db
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId)
  return row?.role || null
}

/** Every group the user belongs to, with their role, for the client's sidebar. */
export function groupsForUser(userId) {
  return db
    .prepare(
      `SELECT g.id, g.name, g.description, gm.role,
              (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM forms f WHERE f.group_id = g.id) AS form_count
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = ?
        ORDER BY g.name COLLATE NOCASE`,
    )
    .all(userId)
    .map(toGroup)
}

/** Every group on the instance. Admin-only listing. */
export function allGroups() {
  return db
    .prepare(
      `SELECT g.id, g.name, g.description, NULL AS role,
              (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM forms f WHERE f.group_id = g.id) AS form_count
         FROM groups g
        ORDER BY g.name COLLATE NOCASE`,
    )
    .all()
    .map(toGroup)
}

function toGroup(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    role: row.role || null,
    memberCount: row.member_count,
    formCount: row.form_count,
  }
}

/**
 * The user's access to one form: 'none' | 'view' | 'edit' | 'manage'.
 * `form` is a row from the forms table.
 */
export function formAccess(user, form) {
  if (!user || !form) return 'none'
  if (isAdmin(user)) return 'manage'

  let best = 'none'

  const ownerRole = groupRole(user.id, form.group_id)
  if (ownerRole) best = OWNER_ROLE_ACCESS[ownerRole] || 'none'

  // A share can only ever raise access, so stop early once nothing could beat it.
  if (best === 'manage') return best

  const shares = db
    .prepare(
      `SELECT s.access, gm.role
         FROM form_shares s
         JOIN group_members gm ON gm.group_id = s.group_id AND gm.user_id = ?
        WHERE s.form_id = ?`,
    )
    .all(user.id, form.id)

  for (const share of shares) {
    const granted = SHARED_ROLE_ACCESS[share.access]?.[share.role] || 'none'
    if (ACCESS_RANK[granted] > ACCESS_RANK[best]) best = granted
  }

  return best
}

/**
 * Route guard: loads req.params.id into req.form and rejects unless the user has
 * at least `required` access. Answers 404 rather than 403 when they have no
 * access at all, so the API never confirms that an id exists to someone who
 * cannot see it.
 */
export function requireFormAccess(required) {
  return (req, res, next) => {
    const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id)
    if (!form) return res.status(404).json({ error: 'Form not found' })

    const access = formAccess(req.user, form)
    if (access === 'none') return res.status(404).json({ error: 'Form not found' })
    if (!atLeast(access, required))
      return res.status(403).json({ error: 'You do not have permission to do that.' })

    req.form = form
    req.formAccess = access
    next()
  }
}

/**
 * Route guard for /groups/:groupId. Managers of the group pass; so do admins,
 * who are treated as managers everywhere.
 */
export function requireGroupRole(required) {
  return (req, res, next) => {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.groupId)
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const role = isAdmin(req.user) ? 'manager' : groupRole(req.user.id, group.id)
    if (!role) return res.status(404).json({ error: 'Group not found' })

    const rank = { viewer: 0, editor: 1, manager: 2 }
    if (rank[role] < rank[required])
      return res.status(403).json({ error: 'You do not have permission to do that.' })

    req.group = group
    req.groupRole = role
    next()
  }
}

/** Guards routes that only a system admin may touch. */
export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Administrator access required.' })
  next()
}

/**
 * The forms a user can see at all, newest edit first, with their access level
 * and owning group joined in. One query rather than a filter over every form,
 * so listing stays cheap as the instance grows.
 */
export function listAccessibleForms(user) {
  const admin = isAdmin(user)
  const rows = db
    .prepare(
      `SELECT f.*,
              g.name AS group_name,
              gm.role AS owner_role,
              (SELECT s.access FROM form_shares s
                 JOIN group_members m ON m.group_id = s.group_id AND m.user_id = :uid
                WHERE s.form_id = f.id
                ORDER BY CASE s.access WHEN 'edit' THEN 0 ELSE 1 END LIMIT 1) AS share_access,
              (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id AND r.completed = 1) AS completed_count,
              (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS response_count,
              (SELECT COUNT(*) FROM views v WHERE v.form_id = f.id) AS view_count,
              (SELECT COUNT(*) FROM fields fl WHERE fl.form_id = f.id) AS field_count
         FROM forms f
         LEFT JOIN groups g ON g.id = f.group_id
         LEFT JOIN group_members gm ON gm.group_id = f.group_id AND gm.user_id = :uid
        WHERE :admin = 1
           OR gm.user_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM form_shares s
                        JOIN group_members m ON m.group_id = s.group_id AND m.user_id = :uid
                       WHERE s.form_id = f.id)
        ORDER BY f.updated_at DESC`,
    )
    .all({ uid: user.id, admin: admin ? 1 : 0 })

  return rows.map((row) => ({ row, access: formAccess(user, row) }))
}
