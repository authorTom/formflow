// Break-glass password reset, run on the machine that holds the database.
//
//   npm run set-password -- someone@example.com 'a new passphrase'
//
// An invite-only instance with no mail server has no self-service reset: an
// administrator resets other people's passwords from the admin screen, but the
// last administrator locking themselves out would otherwise be unrecoverable.
// Shell access to the data directory is the authority here — anyone who has it
// could rewrite the hash by hand anyway.
//
// Also promotes the account to administrator with --admin, and reactivates a
// suspended one, since those are the other ways to end up locked out.

import { db, now } from './db.mjs'
import { destroyAllSessions, hashPassword } from './auth.mjs'

const args = process.argv.slice(2)
const promote = args.includes('--admin')
const [email, password] = args.filter((arg) => !arg.startsWith('--'))

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

if (!email || !password) {
  fail(
    'Usage: npm run set-password -- <email> <new password> [--admin]\n\n' +
      "  Quote a password containing spaces. Add --admin to make the account an\n" +
      '  administrator and reactivate it if it was suspended.',
  )
}

if (password.length < 10) fail('Password must be at least 10 characters.')

const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim())
if (!user) {
  const known = db.prepare('SELECT email FROM users ORDER BY created_at').all()
  fail(
    `No account with the email "${email}".\n\n` +
      (known.length
        ? `  Accounts on this instance:\n${known.map((u) => `    ${u.email}`).join('\n')}`
        : '  This instance has no accounts yet — just register at /register.'),
  )
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id)
if (promote) db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(user.id)

// A reset is the response to a lost or compromised account, so nothing that was
// already signed in as them keeps its access.
destroyAllSessions(user.id)

db.prepare(
  `INSERT INTO audit_log (at, actor_id, actor_email, action, target_type, target_id, detail_json)
   VALUES (?, NULL, 'command line', 'user.password_reset', 'user', ?, ?)`,
).run(now(), user.id, JSON.stringify({ email: user.email, viaCli: true, promoted: promote }))

const role = promote ? 'admin' : user.role
console.log(`\n  Password set for ${user.email} (${role}). Every existing session was signed out.\n`)
