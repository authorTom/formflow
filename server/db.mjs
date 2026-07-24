// SQLite storage. Uses Node's built-in `node:sqlite` (stable from Node 24), so
// there is no native module to compile and the runtime image needs no build
// toolchain. Everything lives in a single file inside FORMFLOW_DATA_DIR, which
// is a Docker volume in production.

import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export const DATA_DIR = process.env.FORMFLOW_DATA_DIR || path.join(process.cwd(), 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'formflow.db'))

// busy_timeout comes first: switching journal modes needs a lock on the file,
// and without a timeout that fails outright if anything still holds it — which
// happens routinely when `node --watch` starts the new process before the old
// one has exited, and on a container restart after an unclean shutdown.
db.exec('PRAGMA busy_timeout = 5000')
// WAL lets readers run while a writer holds the file, which matters because
// every public form view writes an analytics row.
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

// --- Schema -----------------------------------------------------------------
// Migrations are ordered SQL strings; PRAGMA user_version records how many have
// been applied. Append new ones to the end, never edit an existing entry.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE forms (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug          TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    published     INTEGER NOT NULL DEFAULT 0,
    welcome_json  TEXT NOT NULL DEFAULT '{}',
    theme_json    TEXT NOT NULL DEFAULT '{}',
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE INDEX idx_forms_user ON forms(user_id);

  CREATE TABLE fields (
    id              TEXT PRIMARY KEY,
    form_id         TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    required        INTEGER NOT NULL DEFAULT 0,
    properties_json TEXT NOT NULL DEFAULT '{}',
    logic_json      TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX idx_fields_form ON fields(form_id, position);

  CREATE TABLE endings (
    id           TEXT PRIMARY KEY,
    form_id      TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    button_text  TEXT NOT NULL DEFAULT '',
    button_url   TEXT NOT NULL DEFAULT '',
    redirect_url TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_endings_form ON endings(form_id, position);

  CREATE TABLE responses (
    id           TEXT PRIMARY KEY,
    form_id      TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    started_at   TEXT NOT NULL,
    submitted_at TEXT,
    completed    INTEGER NOT NULL DEFAULT 0,
    duration_ms  INTEGER,
    ending_id    TEXT,
    meta_json    TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX idx_responses_form ON responses(form_id, started_at);

  CREATE TABLE answers (
    response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    field_id    TEXT NOT NULL,
    value_json  TEXT NOT NULL,
    text_value  TEXT NOT NULL DEFAULT '',
    answered_at TEXT NOT NULL,
    PRIMARY KEY (response_id, field_id)
  );
  CREATE INDEX idx_answers_field ON answers(field_id);

  CREATE TABLE uploads (
    id            TEXT PRIMARY KEY,
    form_id       TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    response_id   TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    field_id      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name   TEXT NOT NULL,
    mime          TEXT NOT NULL DEFAULT '',
    size          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX idx_uploads_response ON uploads(response_id);

  CREATE TABLE views (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id    TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_views_form ON views(form_id, created_at);
  `,
]

function migrate() {
  const current = db.prepare('PRAGMA user_version').get().user_version
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
migrate()

// --- Helpers ----------------------------------------------------------------

const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz0123456789'

/** Short, URL-safe, collision-resistant id (~62 bits at 12 chars). */
export function newId(length = 12) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  return out
}

export function now() {
  return new Date().toISOString()
}

/** Turn a title into a URL slug, then make it unique against the forms table. */
export function uniqueSlug(title) {
  const base =
    (title || 'form')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'form'
  const taken = db.prepare('SELECT 1 FROM forms WHERE slug = ?')
  let slug = `${base}-${newId(6)}`
  while (taken.get(slug)) slug = `${base}-${newId(6)}`
  return slug
}

/** Run `fn` inside a transaction, rolling back if it throws. */
export function transaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text)
    return value ?? fallback
  } catch {
    return fallback
  }
}
