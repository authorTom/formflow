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
// Foreign keys stay off until migrations have run. Some migrations rebuild a
// table to change a constraint, which means dropping and renaming it — and that
// is only safe with enforcement suspended. See migrate().

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

  // --- 2: groups, roles, invites and sharing ---------------------------------
  // Turns a set of unrelated single-user accounts into an internal, invite-only
  // instance: users hold a system role, belong to groups with a per-group role,
  // and forms belong to a group rather than to a person.
  `
  ALTER TABLE users ADD COLUMN role   TEXT NOT NULL DEFAULT 'member';
  ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

  CREATE TABLE groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL
  );
  -- Group names are how people refer to a team in conversation, so two groups
  -- differing only by case would be a trap. Enforced here rather than in code.
  CREATE UNIQUE INDEX idx_groups_name ON groups(name COLLATE NOCASE);

  CREATE TABLE group_members (
    group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'editor',
    created_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX idx_group_members_user ON group_members(user_id);

  -- One row per invitation. The token is the capability to create exactly one
  -- account, so it is single-use and expires.
  CREATE TABLE invites (
    token        TEXT PRIMARY KEY,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member',
    group_id     TEXT REFERENCES groups(id) ON DELETE CASCADE,
    group_role   TEXT NOT NULL DEFAULT 'editor',
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    accepted_at  TEXT,
    accepted_by  TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_invites_email ON invites(email);

  -- Extra groups a form is shared with, beyond its owning group.
  CREATE TABLE form_shares (
    form_id    TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    access     TEXT NOT NULL DEFAULT 'view',
    created_at TEXT NOT NULL,
    PRIMARY KEY (form_id, group_id)
  );
  CREATE INDEX idx_form_shares_group ON form_shares(group_id);

  CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL,
    actor_id    TEXT,
    actor_email TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX idx_audit_at ON audit_log(at);

  ALTER TABLE forms ADD COLUMN group_id TEXT REFERENCES groups(id);
  -- 'internal' = must be signed in to fill in; 'link' = anyone with the URL.
  ALTER TABLE forms ADD COLUMN access TEXT NOT NULL DEFAULT 'internal';

  -- Who submitted, when the form required a sign-in. NULL for anonymous ones.
  ALTER TABLE responses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

  -- Existing accounts predate roles. The first one created becomes the admin so
  -- the instance is never left with nobody able to invite anyone.
  UPDATE users SET role = 'admin'
   WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);

  -- Give every existing account a group of its own and move its forms there, so
  -- nothing is orphaned. Named after the email because that is already unique;
  -- an admin can rename them afterwards.
  INSERT INTO groups (id, name, description, created_by, created_at)
  SELECT lower(hex(randomblob(6))), email, 'Created automatically when groups were introduced.',
         id, datetime('now') || 'Z'
    FROM users;

  INSERT INTO group_members (group_id, user_id, role, created_at)
  SELECT g.id, g.created_by, 'manager', datetime('now') || 'Z'
    FROM groups g WHERE g.created_by IS NOT NULL;

  UPDATE forms SET group_id = (SELECT g.id FROM groups g WHERE g.created_by = forms.user_id);

  -- Forms that already exist may have had their link shared already, so keep
  -- them open. Only forms created from now on default to internal.
  UPDATE forms SET access = 'link';

  -- Rebuild forms so that deleting a user no longer cascades into deleting
  -- their forms. A form belongs to a group now, and must outlive whoever
  -- happened to create it — user_id is only "who created this" from here on.
  -- (SQLite cannot alter a foreign key in place; a rebuild is the documented
  -- way. Child tables reference the table by *name*, so dropping the old one
  -- and renaming the new one into its place leaves them pointing at the right
  -- table.)
  CREATE TABLE forms_rebuild (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    group_id      TEXT REFERENCES groups(id),
    slug          TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    published     INTEGER NOT NULL DEFAULT 0,
    access        TEXT NOT NULL DEFAULT 'internal',
    welcome_json  TEXT NOT NULL DEFAULT '{}',
    theme_json    TEXT NOT NULL DEFAULT '{}',
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  INSERT INTO forms_rebuild (id, user_id, group_id, slug, title, published, access,
                             welcome_json, theme_json, settings_json, created_at, updated_at)
  SELECT id, user_id, group_id, slug, title, published, access,
         welcome_json, theme_json, settings_json, created_at, updated_at
    FROM forms;

  DROP TABLE forms;
  ALTER TABLE forms_rebuild RENAME TO forms;

  CREATE INDEX idx_forms_user ON forms(user_id);
  CREATE INDEX idx_forms_group ON forms(group_id);
  `,
]

function migrate() {
  const current = db.prepare('PRAGMA user_version').get().user_version
  if (current >= MIGRATIONS.length) return

  // Enforcement must be suspended for the whole run, and toggling it is a no-op
  // inside a transaction — so it is set here, outside the per-migration BEGIN.
  db.exec('PRAGMA foreign_keys = OFF')
  try {
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

    // A rebuilt table with a bad row would otherwise only fail much later, at
    // some unrelated write. Fail loudly here instead.
    const violations = db.prepare('PRAGMA foreign_key_check').all()
    if (violations.length) {
      throw new Error(`Migration left ${violations.length} foreign key violation(s): ${JSON.stringify(violations.slice(0, 5))}`)
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}
migrate()
db.exec('PRAGMA foreign_keys = ON')

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
