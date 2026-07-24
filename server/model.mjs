// Form document helpers.
//
// A form is stored across four tables but the editor and the filler both want
// it as one JSON document: { ...form, fields: [], endings: [] }. These helpers
// convert in both directions and keep the "replace the whole document" save
// path atomic, which is far simpler to reason about than per-field diffing.

import { db, newId, now, parseJson, transaction } from './db.mjs'

/** Field types the builder can create. Kept in sync with src/lib/fieldTypes.ts. */
export const FIELD_TYPES = new Set([
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'url',
  'multiple_choice',
  'dropdown',
  'yes_no',
  'rating',
  'opinion_scale',
  'date',
  'file_upload',
  'statement',
])

/** Types that collect no answer and so never block a "required" check. */
export const NON_INPUT_TYPES = new Set(['statement'])

export function getFormRow(id) {
  return db.prepare('SELECT * FROM forms WHERE id = ?').get(id)
}

export function getFormRowBySlug(slug) {
  return db.prepare('SELECT * FROM forms WHERE slug = ?').get(slug)
}

function fieldsFor(formId) {
  return db
    .prepare('SELECT * FROM fields WHERE form_id = ? ORDER BY position')
    .all(formId)
    .map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      required: !!row.required,
      properties: parseJson(row.properties_json, {}),
      logic: parseJson(row.logic_json, []),
    }))
}

function endingsFor(formId) {
  return db
    .prepare('SELECT * FROM endings WHERE form_id = ? ORDER BY position')
    .all(formId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      buttonText: row.button_text,
      buttonUrl: row.button_url,
      redirectUrl: row.redirect_url,
    }))
}

/** Full editable document for the builder. */
export function formDoc(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    published: !!row.published,
    welcome: parseJson(row.welcome_json, {}),
    theme: parseJson(row.theme_json, {}),
    settings: parseJson(row.settings_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields: fieldsFor(row.id),
    endings: endingsFor(row.id),
  }
}

/**
 * What a respondent is allowed to see: the same document minus anything that
 * only concerns the owner. Logic rules stay because the filler evaluates them
 * client-side; they contain no data the respondent could not infer by trying
 * every branch anyway.
 */
export function publicFormDoc(row) {
  const doc = formDoc(row)
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    welcome: doc.welcome,
    theme: doc.theme,
    settings: doc.settings,
    fields: doc.fields,
    endings: doc.endings,
  }
}

/**
 * Replace every field and ending on a form in one transaction. Ids supplied by
 * the client are preserved when they look valid, so logic rules and previously
 * collected answers keep pointing at the same field across saves.
 */
export function replaceFormContent(formId, { fields = [], endings = [] }) {
  transaction(() => {
    db.prepare('DELETE FROM fields WHERE form_id = ?').run(formId)
    db.prepare('DELETE FROM endings WHERE form_id = ?').run(formId)

    const insertField = db.prepare(
      `INSERT INTO fields (id, form_id, position, type, title, description, required, properties_json, logic_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    fields.forEach((field, index) => {
      const type = FIELD_TYPES.has(field.type) ? field.type : 'short_text'
      insertField.run(
        typeof field.id === 'string' && field.id.length <= 32 ? field.id : newId(),
        formId,
        index,
        type,
        String(field.title ?? ''),
        String(field.description ?? ''),
        field.required ? 1 : 0,
        JSON.stringify(field.properties ?? {}),
        JSON.stringify(Array.isArray(field.logic) ? field.logic : []),
      )
    })

    const insertEnding = db.prepare(
      `INSERT INTO endings (id, form_id, position, title, description, button_text, button_url, redirect_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    endings.forEach((ending, index) => {
      insertEnding.run(
        typeof ending.id === 'string' && ending.id.length <= 32 ? ending.id : newId(),
        formId,
        index,
        String(ending.title ?? ''),
        String(ending.description ?? ''),
        String(ending.buttonText ?? ''),
        String(ending.buttonUrl ?? ''),
        String(ending.redirectUrl ?? ''),
      )
    })

    db.prepare('UPDATE forms SET updated_at = ? WHERE id = ?').run(now(), formId)
  })
}

/**
 * Flatten an answer to a single string for CSV export and the responses table.
 * Kept on the server so exports stay consistent no matter which client wrote
 * the answer.
 */
export function answerToText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(answerToText).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    if (value.name) return String(value.name) // file upload
    return JSON.stringify(value)
  }
  return String(value)
}

/** A response plus its answers, keyed by field id. */
export function responseWithAnswers(responseRow) {
  const answers = db
    .prepare('SELECT field_id, value_json, answered_at FROM answers WHERE response_id = ?')
    .all(responseRow.id)
  const byField = {}
  for (const answer of answers) byField[answer.field_id] = parseJson(answer.value_json, null)
  return {
    id: responseRow.id,
    formId: responseRow.form_id,
    startedAt: responseRow.started_at,
    submittedAt: responseRow.submitted_at,
    completed: !!responseRow.completed,
    durationMs: responseRow.duration_ms,
    endingId: responseRow.ending_id,
    meta: parseJson(responseRow.meta_json, {}),
    answers: byField,
  }
}
