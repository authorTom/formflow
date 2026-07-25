// Groups and their membership.
//
// Deliberately not admin-only: a group manager runs their own group's
// membership without needing the keys to the whole instance. Creating and
// deleting groups stays with administrators, since a group is the unit that
// forms and results hang off.

import { Router } from 'express'
import { db, newId, now } from '../db.mjs'
import { requireAuth } from '../auth.mjs'
import { allGroups, GROUP_ROLES, groupsForUser, isAdmin, requireGroupRole, requireAdmin } from '../permissions.mjs'
import { audit } from '../audit.mjs'

export const groupsRouter = Router()
groupsRouter.use(requireAuth)

/** Members of one group, for the group detail screen. */
function membersOf(groupId) {
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.status, u.role AS system_role, gm.role, gm.created_at
         FROM group_members gm JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ?
        ORDER BY u.name COLLATE NOCASE, u.email COLLATE NOCASE`,
    )
    .all(groupId)
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      status: row.status,
      systemRole: row.system_role,
      role: row.role,
      joinedAt: row.created_at,
    }))
}

function lastManager(groupId, userId) {
  const others = db
    .prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND role = 'manager' AND user_id != ?")
    .get(groupId, userId).n
  return others === 0
}

// --- Collection -------------------------------------------------------------

/** Groups the caller belongs to. Administrators see every group. */
groupsRouter.get('/', (req, res) => {
  res.json({ groups: isAdmin(req.user) ? allGroups() : groupsForUser(req.user.id) })
})

groupsRouter.post('/', requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80)
  const description = String(req.body?.description || '').trim().slice(0, 300)
  if (!name) return res.status(400).json({ error: 'Give the group a name.' })

  if (db.prepare('SELECT 1 FROM groups WHERE name = ? COLLATE NOCASE').get(name))
    return res.status(409).json({ error: 'A group with that name already exists.' })

  const id = newId()
  db.prepare('INSERT INTO groups (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    description,
    req.user.id,
    now(),
  )
  // The creator becomes its first manager, so a new group is never a dead end
  // that nobody can add anyone to.
  db.prepare('INSERT INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    req.user.id,
    'manager',
    now(),
  )

  audit(req.user, 'group.created', { targetType: 'group', targetId: id, detail: { name } })
  res.status(201).json({ group: { id, name, description, role: 'manager', memberCount: 1, formCount: 0 } })
})

// --- Single group -----------------------------------------------------------

groupsRouter.get('/:groupId', requireGroupRole('viewer'), (req, res) => {
  res.json({
    group: {
      id: req.group.id,
      name: req.group.name,
      description: req.group.description,
      role: req.groupRole,
      createdAt: req.group.created_at,
    },
    members: membersOf(req.group.id),
    // Only a manager needs the list of people they could add.
    candidates:
      req.groupRole === 'manager'
        ? db
            .prepare(
              `SELECT id, email, name FROM users
                WHERE status = 'active'
                  AND id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)
                ORDER BY name COLLATE NOCASE, email COLLATE NOCASE`,
            )
            .all(req.group.id)
        : [],
  })
})

groupsRouter.patch('/:groupId', requireGroupRole('manager'), (req, res) => {
  const name = req.body?.name === undefined ? req.group.name : String(req.body.name).trim().slice(0, 80)
  const description =
    req.body?.description === undefined
      ? req.group.description
      : String(req.body.description).trim().slice(0, 300)

  if (!name) return res.status(400).json({ error: 'Give the group a name.' })
  if (
    name.toLowerCase() !== req.group.name.toLowerCase() &&
    db.prepare('SELECT 1 FROM groups WHERE name = ? COLLATE NOCASE').get(name)
  )
    return res.status(409).json({ error: 'A group with that name already exists.' })

  db.prepare('UPDATE groups SET name = ?, description = ? WHERE id = ?').run(name, description, req.group.id)
  audit(req.user, 'group.updated', { targetType: 'group', targetId: req.group.id, detail: { name, description } })
  res.json({ group: { id: req.group.id, name, description, role: req.groupRole } })
})

groupsRouter.delete('/:groupId', requireAdmin, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.groupId)
  if (!group) return res.status(404).json({ error: 'Group not found' })

  // Forms reference the group without a cascade, so deleting a populated group
  // would leave forms nobody but an administrator could reach. Make the caller
  // deal with them first rather than silently orphaning work.
  const forms = db.prepare('SELECT COUNT(*) AS n FROM forms WHERE group_id = ?').get(group.id).n
  if (forms)
    return res.status(409).json({
      error: `This group still owns ${forms} form${forms === 1 ? '' : 's'}. Move or delete them first.`,
    })

  db.prepare('DELETE FROM groups WHERE id = ?').run(group.id)
  audit(req.user, 'group.deleted', { targetType: 'group', targetId: group.id, detail: { name: group.name } })
  res.json({ ok: true })
})

// --- Membership -------------------------------------------------------------

groupsRouter.post('/:groupId/members', requireGroupRole('manager'), (req, res) => {
  const userId = String(req.body?.userId || '')
  const role = GROUP_ROLES.includes(req.body?.role) ? req.body.role : 'editor'

  const target = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(userId)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(req.group.id, userId))
    return res.status(409).json({ error: 'They are already in this group.' })

  db.prepare('INSERT INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(
    req.group.id,
    userId,
    role,
    now(),
  )
  audit(req.user, 'group.member_added', {
    targetType: 'group',
    targetId: req.group.id,
    detail: { group: req.group.name, email: target.email, role },
  })
  res.status(201).json({ members: membersOf(req.group.id) })
})

groupsRouter.patch('/:groupId/members/:userId', requireGroupRole('manager'), (req, res) => {
  const role = req.body?.role
  if (!GROUP_ROLES.includes(role)) return res.status(400).json({ error: 'Unknown group role.' })

  const member = db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(req.group.id, req.params.userId)
  if (!member) return res.status(404).json({ error: 'They are not in this group.' })

  // A group with no manager can only be repaired by an administrator, so do not
  // let the last one demote themselves into that corner.
  if (member.role === 'manager' && role !== 'manager' && lastManager(req.group.id, member.user_id))
    return res.status(409).json({ error: 'This is the group’s only manager. Promote someone else first.' })

  db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(
    role,
    req.group.id,
    member.user_id,
  )
  audit(req.user, 'group.member_role_changed', {
    targetType: 'group',
    targetId: req.group.id,
    detail: { group: req.group.name, userId: member.user_id, role },
  })
  res.json({ members: membersOf(req.group.id) })
})

groupsRouter.delete('/:groupId/members/:userId', requireGroupRole('manager'), (req, res) => {
  const member = db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(req.group.id, req.params.userId)
  if (!member) return res.status(404).json({ error: 'They are not in this group.' })

  if (member.role === 'manager' && lastManager(req.group.id, member.user_id))
    return res.status(409).json({ error: 'This is the group’s only manager. Promote someone else first.' })

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.group.id, member.user_id)
  audit(req.user, 'group.member_removed', {
    targetType: 'group',
    targetId: req.group.id,
    detail: { group: req.group.name, userId: member.user_id },
  })
  res.json({ members: membersOf(req.group.id) })
})
