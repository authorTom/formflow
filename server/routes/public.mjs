// Public API: everything a respondent's browser touches. No sign-in.
//
// A response id doubles as the capability to write to that response: it is 24
// random characters, handed out only to the browser that started it, and it
// stops accepting writes once the response is submitted.

import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import { db, newId, now, UPLOAD_DIR } from '../db.mjs'
import { answerToText, getFormRowBySlug, publicFormDoc } from '../model.mjs'

export const publicRouter = Router()

const MAX_UPLOAD_MB = Number(process.env.FORMFLOW_MAX_UPLOAD_MB || 10)
const MAX_ANSWER_BYTES = 50_000

// Per-IP token bucket so a single client cannot flood the response table.
const buckets = new Map()
const RATE_LIMIT = Number(process.env.FORMFLOW_RATE_LIMIT || 120) // writes per minute
function rateLimited(req) {
  const key = req.ip
  const minute = Math.floor(Date.now() / 60_000)
  const entry = buckets.get(key)
  if (!entry || entry.minute !== minute) {
    buckets.set(key, { minute, count: 1 })
    if (buckets.size > 10_000) buckets.clear() // cheap unbounded-growth guard
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT
}

/** Loads a published form by slug. Unpublished forms are invisible here. */
function loadPublishedForm(req, res, next) {
  const row = getFormRowBySlug(req.params.slug)
  if (!row || !row.published) return res.status(404).json({ error: 'This form is not available.' })
  req.form = row
  next()
}

/** Loads an open (not yet submitted) response by id. */
function loadOpenResponse(req, res, next) {
  const row = db.prepare('SELECT * FROM responses WHERE id = ?').get(req.params.responseId)
  if (!row) return res.status(404).json({ error: 'Response not found' })
  if (row.completed) return res.status(409).json({ error: 'This response was already submitted.' })
  req.response = row
  next()
}

// --- Reading the form -------------------------------------------------------

publicRouter.get('/forms/:slug', loadPublishedForm, (req, res) => {
  // `preview=1` is what the builder's preview pane uses: same document, but it
  // must not pollute the owner's view count.
  if (req.query.preview !== '1') {
    db.prepare('INSERT INTO views (form_id, created_at) VALUES (?, ?)').run(req.form.id, now())
  }
  res.json({ form: publicFormDoc(req.form) })
})

// --- Filling it in ----------------------------------------------------------

publicRouter.post('/forms/:slug/responses', loadPublishedForm, (req, res) => {
  if (rateLimited(req)) return res.status(429).json({ error: 'Too many requests. Slow down.' })

  const id = newId(24)
  db.prepare(
    'INSERT INTO responses (id, form_id, started_at, completed, meta_json) VALUES (?, ?, ?, 0, ?)',
  ).run(
    id,
    req.form.id,
    now(),
    JSON.stringify({
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
      referrer: String(req.get('referer') || '').slice(0, 300),
    }),
  )
  res.status(201).json({ responseId: id })
})

publicRouter.patch('/responses/:responseId', loadOpenResponse, (req, res) => {
  if (rateLimited(req)) return res.status(429).json({ error: 'Too many requests. Slow down.' })

  const fieldId = String(req.body?.fieldId || '')
  const field = db
    .prepare('SELECT id FROM fields WHERE id = ? AND form_id = ?')
    .get(fieldId, req.response.form_id)
  if (!field) return res.status(400).json({ error: 'Unknown field' })

  const valueJson = JSON.stringify(req.body?.value ?? null)
  if (valueJson.length > MAX_ANSWER_BYTES) return res.status(413).json({ error: 'Answer is too long.' })

  // Answers arrive as the respondent moves through the form, so every save is
  // an upsert — going back and changing an answer overwrites the old one.
  db.prepare(
    `INSERT INTO answers (response_id, field_id, value_json, text_value, answered_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(response_id, field_id)
     DO UPDATE SET value_json = excluded.value_json, text_value = excluded.text_value, answered_at = excluded.answered_at`,
  ).run(req.response.id, fieldId, valueJson, answerToText(req.body?.value).slice(0, 500), now())

  res.json({ ok: true })
})

publicRouter.post('/responses/:responseId/complete', loadOpenResponse, (req, res) => {
  const submittedAt = now()
  const duration = Date.parse(submittedAt) - Date.parse(req.response.started_at)
  const endingId = req.body?.endingId ? String(req.body.endingId) : null

  db.prepare(
    'UPDATE responses SET completed = 1, submitted_at = ?, duration_ms = ?, ending_id = ? WHERE id = ?',
  ).run(submittedAt, Number.isFinite(duration) ? duration : null, endingId, req.response.id)

  res.json({ ok: true })
})

// --- File upload questions --------------------------------------------------

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    // Never trust the client filename on disk: store under a generated id and
    // keep the original only as a database column for display and download.
    filename: (_req, file, cb) => cb(null, `${newId(24)}${path.extname(file.originalname).slice(0, 12)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
})

publicRouter.post('/responses/:responseId/upload', loadOpenResponse, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE'
      return res
        .status(tooBig ? 413 : 400)
        .json({ error: tooBig ? `Files must be under ${MAX_UPLOAD_MB} MB.` : 'Upload failed.' })
    }
    if (!req.file) return res.status(400).json({ error: 'No file received.' })

    const fieldId = String(req.body?.fieldId || '')
    const field = db
      .prepare("SELECT id FROM fields WHERE id = ? AND form_id = ? AND type = 'file_upload'")
      .get(fieldId, req.response.form_id)
    if (!field) return res.status(400).json({ error: 'Unknown field' })

    const id = newId(16)
    db.prepare(
      `INSERT INTO uploads (id, form_id, response_id, field_id, original_name, stored_name, mime, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.response.form_id,
      req.response.id,
      fieldId,
      req.file.originalname.slice(0, 255),
      req.file.filename,
      req.file.mimetype || '',
      req.file.size,
      now(),
    )

    res.status(201).json({ upload: { id, name: req.file.originalname, size: req.file.size } })
  })
})
