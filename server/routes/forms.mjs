// Owner-side API: everything behind a sign-in. Creating and editing forms,
// reading and exporting responses, analytics, and downloading uploaded files.

import { Router } from 'express'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { db, newId, now, parseJson, uniqueSlug, UPLOAD_DIR } from '../db.mjs'
import { requireAuth } from '../auth.mjs'
import {
  atLeast,
  groupRole,
  isAdmin,
  listAccessibleForms,
  requireFormAccess,
  SHARE_ACCESS,
} from '../permissions.mjs'
import { audit } from '../audit.mjs'
import {
  answerToText,
  formDoc,
  getFormRow,
  NON_INPUT_TYPES,
  publicFormDoc,
  replaceFormContent,
  responseWithAnswers,
  sharesFor,
} from '../model.mjs'

export const formsRouter = Router()
formsRouter.use(requireAuth)

/**
 * Can this user put a form into this group? Anything that creates or moves a
 * form runs through here so an editor cannot deposit work into a group they
 * only read, or one they are not in at all.
 */
function canCreateIn(user, groupId) {
  if (isAdmin(user)) return !!db.prepare('SELECT 1 FROM groups WHERE id = ?').get(groupId)
  const role = groupRole(user.id, groupId)
  return role === 'manager' || role === 'editor'
}

// --- Collection -------------------------------------------------------------

formsRouter.get('/', (req, res) => {
  res.json({
    forms: listAccessibleForms(req.user).map(({ row, access }) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      published: !!row.published,
      access: row.access,
      groupId: row.group_id,
      groupName: row.group_name || null,
      // What *this* user may do with it, so the client can hide what it must.
      permission: access,
      theme: parseJson(row.theme_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stats: {
        views: row.view_count,
        starts: row.response_count,
        completions: row.completed_count,
        fields: row.field_count,
      },
    })),
  })
})

formsRouter.post('/', (req, res) => {
  const title = String(req.body?.title || 'Untitled form').slice(0, 200)
  const groupId = String(req.body?.groupId || '')

  if (!groupId) return res.status(400).json({ error: 'Choose a group to create this form in.' })
  if (!canCreateIn(req.user, groupId))
    return res.status(403).json({ error: 'You cannot create forms in that group.' })

  const id = newId()
  const timestamp = now()

  db.prepare(
    `INSERT INTO forms (id, user_id, group_id, slug, title, published, access, welcome_json, theme_json, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 'internal', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.user.id,
    groupId,
    uniqueSlug(title),
    title,
    JSON.stringify(req.body?.welcome ?? { enabled: true, title, description: '', buttonText: 'Start' }),
    JSON.stringify(req.body?.theme ?? {}),
    JSON.stringify(req.body?.settings ?? {}),
    timestamp,
    timestamp,
  )

  // A blank form is a dead end in the editor, so seed one question and a
  // thank-you screen — the same shape the builder would have produced.
  replaceFormContent(id, {
    fields: req.body?.fields ?? [
      {
        id: newId(),
        type: 'short_text',
        title: 'What is your name?',
        description: '',
        required: false,
        properties: {},
        logic: [],
      },
    ],
    endings: req.body?.endings ?? [
      { id: newId(), title: 'Thank you!', description: 'Your response has been recorded.', buttonText: '', buttonUrl: '', redirectUrl: '' },
    ],
  })

  audit(req.user, 'form.created', { targetType: 'form', targetId: id, detail: { title, groupId } })
  res.status(201).json({ form: withPermission(formDoc(getFormRow(id)), 'manage') })
})

// --- Single form ------------------------------------------------------------

/** Tells the client what it may do, so the builder can render read-only. */
function withPermission(doc, permission) {
  return { ...doc, permission }
}

formsRouter.get('/:id', requireFormAccess('view'), (req, res) => {
  res.json({ form: withPermission(formDoc(req.form), req.formAccess) })
})

// The owner's own preview. Same payload the public route serves, but it works
// on drafts and never counts as a view.
formsRouter.get('/:id/preview', requireFormAccess('view'), (req, res) => {
  res.json({ form: publicFormDoc(req.form) })
})

formsRouter.put('/:id', requireFormAccess('edit'), (req, res) => {
  const body = req.body || {}
  const current = req.form
  const title = String(body.title ?? current.title).slice(0, 200) || 'Untitled form'

  // Who may fill this in is a security setting, not a content one, so it takes
  // 'manage' — an editor can build the form but not open it to the world.
  let access = current.access
  if (body.access !== undefined && body.access !== current.access) {
    if (!atLeast(req.formAccess, 'manage'))
      return res.status(403).json({ error: 'Only a group manager can change who may fill this form in.' })
    if (!['internal', 'link'].includes(body.access))
      return res.status(400).json({ error: 'Unknown access setting.' })
    access = body.access
    audit(req.user, 'form.access_changed', {
      targetType: 'form',
      targetId: current.id,
      detail: { title: current.title, from: current.access, to: access },
    })
  }

  // Moving a form between groups changes who can see the results, so it needs
  // 'manage' here and the right to create in the destination.
  let groupId = current.group_id
  if (body.groupId !== undefined && body.groupId !== current.group_id) {
    if (!atLeast(req.formAccess, 'manage'))
      return res.status(403).json({ error: 'Only a group manager can move this form.' })
    if (!canCreateIn(req.user, String(body.groupId)))
      return res.status(403).json({ error: 'You cannot move this form into that group.' })
    groupId = String(body.groupId)
    // A share with the new owning group would be redundant and confusing.
    db.prepare('DELETE FROM form_shares WHERE form_id = ? AND group_id = ?').run(current.id, groupId)
    audit(req.user, 'form.moved', {
      targetType: 'form',
      targetId: current.id,
      detail: { title: current.title, from: current.group_id, to: groupId },
    })
  }

  // Keep the public URL in step with the title while the form is still private
  // and unanswered. Once it has been published or has collected a response, the
  // slug is frozen — renaming must never break a link someone already shared.
  const shareable =
    current.published ||
    db.prepare('SELECT 1 FROM responses WHERE form_id = ? LIMIT 1').get(current.id)
  const slug = !shareable && title !== current.title ? uniqueSlug(title) : current.slug
  if (slug !== current.slug) db.prepare('UPDATE forms SET slug = ? WHERE id = ?').run(slug, current.id)

  db.prepare(
    `UPDATE forms
        SET title = ?, published = ?, access = ?, group_id = ?, welcome_json = ?, theme_json = ?, settings_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    title,
    body.published === undefined ? current.published : body.published ? 1 : 0,
    access,
    groupId,
    JSON.stringify(body.welcome ?? parseJson(current.welcome_json, {})),
    JSON.stringify(body.theme ?? parseJson(current.theme_json, {})),
    JSON.stringify(body.settings ?? parseJson(current.settings_json, {})),
    now(),
    current.id,
  )

  // Fields and endings are only replaced when the client sends them, so a
  // lightweight publish toggle does not have to round-trip the whole document.
  if (Array.isArray(body.fields) || Array.isArray(body.endings)) {
    replaceFormContent(current.id, {
      fields: body.fields ?? formDoc(current).fields,
      endings: body.endings ?? formDoc(current).endings,
    })
  }

  const updated = getFormRow(current.id)
  res.json({ form: withPermission(formDoc(updated), req.formAccess) })
})

formsRouter.delete('/:id', requireFormAccess('manage'), async (req, res) => {
  // Remove uploaded files from disk first; the cascade takes their rows.
  const files = db.prepare('SELECT stored_name FROM uploads WHERE form_id = ?').all(req.form.id)
  db.prepare('DELETE FROM forms WHERE id = ?').run(req.form.id)
  await Promise.allSettled(files.map((f) => unlink(path.join(UPLOAD_DIR, f.stored_name))))
  audit(req.user, 'form.deleted', {
    targetType: 'form',
    targetId: req.form.id,
    detail: { title: req.form.title, groupId: req.form.group_id },
  })
  res.json({ ok: true })
})

formsRouter.post('/:id/duplicate', requireFormAccess('view'), (req, res) => {
  const source = formDoc(req.form)
  // The copy lands in the group the caller asks for, defaulting to the
  // original's. Someone who can only *view* a form may still take a copy into a
  // group of their own — they are not gaining access to anyone's responses.
  const groupId = String(req.body?.groupId || req.form.group_id || '')
  if (!canCreateIn(req.user, groupId))
    return res.status(403).json({ error: 'You cannot create forms in that group.' })

  const id = newId()
  const timestamp = now()
  const title = `${source.title} (copy)`

  db.prepare(
    `INSERT INTO forms (id, user_id, group_id, slug, title, published, access, welcome_json, theme_json, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.user.id,
    groupId,
    uniqueSlug(title),
    title,
    source.access,
    JSON.stringify(source.welcome),
    JSON.stringify(source.theme),
    JSON.stringify(source.settings),
    timestamp,
    timestamp,
  )

  // Ids are copied verbatim: they are unique per form, and keeping them means
  // logic rules in the duplicate still resolve without rewriting every target.
  replaceFormContent(id, { fields: source.fields, endings: source.endings })
  audit(req.user, 'form.duplicated', { targetType: 'form', targetId: id, detail: { from: req.form.id, groupId } })
  res.status(201).json({ form: withPermission(formDoc(getFormRow(id)), 'manage') })
})

// --- Sharing with other groups ----------------------------------------------

formsRouter.get('/:id/shares', requireFormAccess('view'), (req, res) => {
  res.json({
    shares: sharesFor(req.form.id),
    // Groups this form could be shared with: any group for an administrator,
    // otherwise only groups the caller is actually in — you should not be able
    // to hand results to a team you have nothing to do with. The owning group
    // is excluded either way, since it already has access.
    candidates: db
      .prepare(
        `SELECT g.id, g.name
           FROM groups g
          WHERE g.id IS NOT :formGroup
            AND (:admin = 1
                 OR EXISTS (SELECT 1 FROM group_members gm
                             WHERE gm.group_id = g.id AND gm.user_id = :uid))
          ORDER BY g.name COLLATE NOCASE`,
      )
      .all({ uid: req.user.id, admin: isAdmin(req.user) ? 1 : 0, formGroup: req.form.group_id }),
  })
})

formsRouter.put('/:id/shares/:groupId', requireFormAccess('manage'), (req, res) => {
  const groupId = String(req.params.groupId)
  const access = SHARE_ACCESS.includes(req.body?.access) ? req.body.access : 'view'

  if (groupId === req.form.group_id)
    return res.status(400).json({ error: 'That group already owns this form.' })
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(groupId)
  if (!group) return res.status(404).json({ error: 'Group not found' })

  db.prepare(
    `INSERT INTO form_shares (form_id, group_id, access, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(form_id, group_id) DO UPDATE SET access = excluded.access`,
  ).run(req.form.id, groupId, access, now())

  audit(req.user, 'form.shared', {
    targetType: 'form',
    targetId: req.form.id,
    detail: { title: req.form.title, group: group.name, access },
  })
  res.json({ shares: sharesFor(req.form.id) })
})

formsRouter.delete('/:id/shares/:groupId', requireFormAccess('manage'), (req, res) => {
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.groupId)
  db.prepare('DELETE FROM form_shares WHERE form_id = ? AND group_id = ?').run(req.form.id, req.params.groupId)
  audit(req.user, 'form.unshared', {
    targetType: 'form',
    targetId: req.form.id,
    detail: { title: req.form.title, group: group?.name || req.params.groupId },
  })
  res.json({ shares: sharesFor(req.form.id) })
})

// --- Responses --------------------------------------------------------------

formsRouter.get('/:id/responses', requireFormAccess('view'), (req, res) => {
  const rows = db
    .prepare('SELECT * FROM responses WHERE form_id = ? ORDER BY started_at DESC LIMIT 1000')
    .all(req.form.id)
  const uploads = db
    .prepare('SELECT id, response_id, field_id, original_name, size, mime FROM uploads WHERE form_id = ?')
    .all(req.form.id)

  res.json({
    responses: rows.map(responseWithAnswers),
    uploads,
    fields: formDoc(req.form).fields,
  })
})

formsRouter.delete('/:id/responses/:responseId', requireFormAccess('edit'), async (req, res) => {
  const files = db
    .prepare('SELECT stored_name FROM uploads WHERE response_id = ? AND form_id = ?')
    .all(req.params.responseId, req.form.id)
  db.prepare('DELETE FROM responses WHERE id = ? AND form_id = ?').run(req.params.responseId, req.form.id)
  await Promise.allSettled(files.map((f) => unlink(path.join(UPLOAD_DIR, f.stored_name))))
  res.json({ ok: true })
})

// --- Export -----------------------------------------------------------------

function csvCell(value) {
  let text = String(value ?? '')
  // A cell opening with one of these is treated as a formula by Excel, Sheets
  // and LibreOffice — so a respondent could type =HYPERLINK(...) into a form and
  // have it execute on whoever opens the export. A leading apostrophe makes the
  // spreadsheet read it as text. Tab and CR are here because they are stripped
  // before the formula check happens in some versions.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  // Quote whenever the value could break the row, and double any inner quotes.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

formsRouter.get('/:id/export', requireFormAccess('view'), (req, res) => {
  const doc = formDoc(req.form)
  const rows = db
    .prepare('SELECT * FROM responses WHERE form_id = ? ORDER BY started_at DESC')
    .all(req.form.id)
  const responses = rows.map(responseWithAnswers)
  const inputFields = doc.fields.filter((f) => !NON_INPUT_TYPES.has(f.type))
  const filenameBase = doc.slug || 'responses'

  if (req.query.format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.json"`)
    return res.json({
      form: { id: doc.id, title: doc.title, slug: doc.slug },
      fields: inputFields.map((f) => ({ id: f.id, title: f.title, type: f.type })),
      responses,
    })
  }

  const header = ['Response ID', 'Respondent', 'Started at', 'Submitted at', 'Completed', 'Duration (s)'].concat(
    inputFields.map((f, i) => f.title || `Question ${i + 1}`),
  )
  const lines = [header.map(csvCell).join(',')]
  for (const response of responses) {
    const row = [
      response.id,
      response.respondent?.email || 'Anonymous',
      response.startedAt,
      response.submittedAt || '',
      response.completed ? 'yes' : 'no',
      response.durationMs == null ? '' : Math.round(response.durationMs / 1000),
      ...inputFields.map((f) => answerToText(response.answers[f.id])),
    ]
    lines.push(row.map(csvCell).join(','))
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`)
  // BOM so Excel opens UTF-8 answers correctly.
  res.send('﻿' + lines.join('\r\n'))
})

// --- Analytics --------------------------------------------------------------

formsRouter.get('/:id/analytics', requireFormAccess('view'), (req, res) => {
  const doc = formDoc(req.form)
  const formId = req.form.id

  const views = db.prepare('SELECT COUNT(*) AS n FROM views WHERE form_id = ?').get(formId).n
  const starts = db.prepare('SELECT COUNT(*) AS n FROM responses WHERE form_id = ?').get(formId).n
  const completions = db
    .prepare('SELECT COUNT(*) AS n FROM responses WHERE form_id = ? AND completed = 1')
    .get(formId).n
  const avgDuration = db
    .prepare('SELECT AVG(duration_ms) AS ms FROM responses WHERE form_id = ? AND completed = 1')
    .get(formId).ms

  // Daily counts for the last 30 days, zero-filled on the client.
  const daily = db
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day,
              COUNT(*) AS starts,
              SUM(completed) AS completions
         FROM responses
        WHERE form_id = ? AND started_at >= ?
        GROUP BY day ORDER BY day`,
    )
    .all(formId, new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10))

  const inputFields = doc.fields.filter((f) => !NON_INPUT_TYPES.has(f.type))
  const answerRows = db
    .prepare(
      `SELECT a.field_id, a.value_json
         FROM answers a JOIN responses r ON r.id = a.response_id
        WHERE r.form_id = ?`,
    )
    .all(formId)

  const byField = new Map()
  for (const row of answerRows) {
    if (!byField.has(row.field_id)) byField.set(row.field_id, [])
    byField.get(row.field_id).push(parseJson(row.value_json, null))
  }

  const questions = inputFields.map((field) => {
    const values = (byField.get(field.id) || []).filter((v) => v !== null && v !== '')
    const base = { id: field.id, title: field.title, type: field.type, answered: values.length }

    if (['multiple_choice', 'dropdown', 'yes_no'].includes(field.type)) {
      const counts = new Map()
      for (const value of values) {
        for (const item of Array.isArray(value) ? value : [value]) {
          const label = typeof item === 'boolean' ? (item ? 'Yes' : 'No') : String(item)
          counts.set(label, (counts.get(label) || 0) + 1)
        }
      }
      return {
        ...base,
        kind: 'choice',
        options: [...counts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
      }
    }

    if (['rating', 'opinion_scale', 'number'].includes(field.type)) {
      const numbers = values.map(Number).filter((n) => Number.isFinite(n))
      const counts = new Map()
      for (const n of numbers) counts.set(n, (counts.get(n) || 0) + 1)
      return {
        ...base,
        kind: 'numeric',
        average: numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null,
        min: numbers.length ? Math.min(...numbers) : null,
        max: numbers.length ? Math.max(...numbers) : null,
        distribution: [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => a.value - b.value),
      }
    }

    return {
      ...base,
      kind: 'text',
      samples: values.slice(-8).reverse().map(answerToText),
    }
  })

  // Drop-off walks the questions in order: how many people who started ever
  // answered this one. It is monotonic in practice, but logic jumps mean a
  // later question can legitimately have more answers than an earlier one.
  const funnel = questions.map((q, index) => ({
    id: q.id,
    title: q.title || `Question ${index + 1}`,
    reached: q.answered,
    dropOff: index === 0 ? Math.max(0, starts - q.answered) : Math.max(0, questions[index - 1].answered - q.answered),
  }))

  res.json({
    summary: {
      views,
      starts,
      completions,
      completionRate: starts ? completions / starts : 0,
      viewToStartRate: views ? starts / views : 0,
      averageDurationMs: avgDuration ?? null,
    },
    daily,
    questions,
    funnel,
  })
})

// --- Uploaded files ---------------------------------------------------------

formsRouter.get('/:id/uploads/:uploadId', requireFormAccess('view'), (req, res) => {
  const file = db
    .prepare('SELECT * FROM uploads WHERE id = ? AND form_id = ?')
    .get(req.params.uploadId, req.form.id)
  if (!file) return res.status(404).json({ error: 'File not found' })

  // stored_name is generated server-side, but resolve and re-check anyway so a
  // tampered database row can never escape the upload directory.
  const filePath = path.join(UPLOAD_DIR, path.basename(file.stored_name))
  if (!filePath.startsWith(UPLOAD_DIR)) return res.status(400).json({ error: 'Bad path' })

  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`)
  createReadStream(filePath)
    .on('error', () => res.status(404).end())
    .pipe(res)
})
