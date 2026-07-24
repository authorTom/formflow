// Owner-side API: everything behind a sign-in. Creating and editing forms,
// reading and exporting responses, analytics, and downloading uploaded files.

import { Router } from 'express'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { db, newId, now, parseJson, uniqueSlug, UPLOAD_DIR } from '../db.mjs'
import { requireAuth } from '../auth.mjs'
import {
  answerToText,
  formDoc,
  getFormRow,
  NON_INPUT_TYPES,
  publicFormDoc,
  replaceFormContent,
  responseWithAnswers,
} from '../model.mjs'

export const formsRouter = Router()
formsRouter.use(requireAuth)

/** Loads req.params.id and rejects unless the signed-in user owns it. */
function loadOwnedForm(req, res, next) {
  const row = getFormRow(req.params.id)
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'Form not found' })
  req.form = row
  next()
}

// --- Collection -------------------------------------------------------------

formsRouter.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*,
              (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id AND r.completed = 1) AS completed_count,
              (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS response_count,
              (SELECT COUNT(*) FROM views v WHERE v.form_id = f.id) AS view_count,
              (SELECT COUNT(*) FROM fields fl WHERE fl.form_id = f.id) AS field_count
         FROM forms f
        WHERE f.user_id = ?
        ORDER BY f.updated_at DESC`,
    )
    .all(req.user.id)

  res.json({
    forms: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      published: !!row.published,
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
  const id = newId()
  const timestamp = now()

  db.prepare(
    `INSERT INTO forms (id, user_id, slug, title, published, welcome_json, theme_json, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.user.id,
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

  res.status(201).json({ form: formDoc(getFormRow(id)) })
})

// --- Single form ------------------------------------------------------------

formsRouter.get('/:id', loadOwnedForm, (req, res) => {
  res.json({ form: formDoc(req.form) })
})

// The owner's own preview. Same payload the public route serves, but it works
// on drafts and never counts as a view.
formsRouter.get('/:id/preview', loadOwnedForm, (req, res) => {
  res.json({ form: publicFormDoc(req.form) })
})

formsRouter.put('/:id', loadOwnedForm, (req, res) => {
  const body = req.body || {}
  const current = req.form
  const title = String(body.title ?? current.title).slice(0, 200) || 'Untitled form'

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
        SET title = ?, published = ?, welcome_json = ?, theme_json = ?, settings_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    title,
    body.published === undefined ? current.published : body.published ? 1 : 0,
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

  res.json({ form: formDoc(getFormRow(current.id)) })
})

formsRouter.delete('/:id', loadOwnedForm, async (req, res) => {
  // Remove uploaded files from disk first; the cascade takes their rows.
  const files = db.prepare('SELECT stored_name FROM uploads WHERE form_id = ?').all(req.form.id)
  db.prepare('DELETE FROM forms WHERE id = ?').run(req.form.id)
  await Promise.allSettled(files.map((f) => unlink(path.join(UPLOAD_DIR, f.stored_name))))
  res.json({ ok: true })
})

formsRouter.post('/:id/duplicate', loadOwnedForm, (req, res) => {
  const source = formDoc(req.form)
  const id = newId()
  const timestamp = now()
  const title = `${source.title} (copy)`

  db.prepare(
    `INSERT INTO forms (id, user_id, slug, title, published, welcome_json, theme_json, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.user.id,
    uniqueSlug(title),
    title,
    JSON.stringify(source.welcome),
    JSON.stringify(source.theme),
    JSON.stringify(source.settings),
    timestamp,
    timestamp,
  )

  // Ids are copied verbatim: they are unique per form, and keeping them means
  // logic rules in the duplicate still resolve without rewriting every target.
  replaceFormContent(id, { fields: source.fields, endings: source.endings })
  res.status(201).json({ form: formDoc(getFormRow(id)) })
})

// --- Responses --------------------------------------------------------------

formsRouter.get('/:id/responses', loadOwnedForm, (req, res) => {
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

formsRouter.delete('/:id/responses/:responseId', loadOwnedForm, async (req, res) => {
  const files = db
    .prepare('SELECT stored_name FROM uploads WHERE response_id = ? AND form_id = ?')
    .all(req.params.responseId, req.form.id)
  db.prepare('DELETE FROM responses WHERE id = ? AND form_id = ?').run(req.params.responseId, req.form.id)
  await Promise.allSettled(files.map((f) => unlink(path.join(UPLOAD_DIR, f.stored_name))))
  res.json({ ok: true })
})

// --- Export -----------------------------------------------------------------

function csvCell(value) {
  const text = String(value ?? '')
  // Quote whenever the value could break the row, and double any inner quotes.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

formsRouter.get('/:id/export', loadOwnedForm, (req, res) => {
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

  const header = ['Response ID', 'Started at', 'Submitted at', 'Completed', 'Duration (s)'].concat(
    inputFields.map((f, i) => f.title || `Question ${i + 1}`),
  )
  const lines = [header.map(csvCell).join(',')]
  for (const response of responses) {
    const row = [
      response.id,
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

formsRouter.get('/:id/analytics', loadOwnedForm, (req, res) => {
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

formsRouter.get('/:id/uploads/:uploadId', loadOwnedForm, (req, res) => {
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
