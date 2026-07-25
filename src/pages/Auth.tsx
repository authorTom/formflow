import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, GitBranch, ShieldCheck, Sparkles, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../components/AuthProvider'
import { api, ApiError } from '../lib/api'

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="auth-card">
          <Link to="/" className="brand" style={{ marginBottom: 26 }}>
            <span className="brand-mark">
              <Sparkles size={14} />
            </span>
            FormFlow
          </Link>
          {children}
        </div>
      </div>

      <aside className="auth-aside">
        <h2>Feedback, kept in-house.</h2>
        <ul>
          <li>
            <ShieldCheck size={19} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>Invite only</b> — accounts exist because an administrator created them, and nobody else
              can sign up.
            </span>
          </li>
          <li>
            <Users size={19} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>Groups</b> — forms belong to a team, and results can be shared with the teams that need
              to see them.
            </span>
          </li>
          <li>
            <GitBranch size={19} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>Conditional logic</b> — send people down different paths based on what they answer.
            </span>
          </li>
          <li>
            <BarChart3 size={19} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>Real analytics</b> — completion rates, drop-off per question, and CSV export.
            </span>
          </li>
        </ul>
      </aside>
    </div>
  )
}

function useAuthSubmit(action: () => Promise<void>, redirectTo: string) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await action()
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return { submit, error, busy }
}

/**
 * Asks the server what registration is currently possible. Returns null while
 * still loading, so the sign-in screen never flashes a link that turns out not
 * to apply.
 */
function useRegistrationState(invite?: string) {
  const [state, setState] = useState<{
    firstRun: boolean
    inviteRequired: boolean
    invite: { email: string; groupName: string | null } | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .registration(invite)
      .then((data) => !cancelled && setState(data))
      .catch(() => !cancelled && setState({ firstRun: false, inviteRequired: true, invite: null }))
    return () => {
      cancelled = true
    }
  }, [invite])

  return state
}

export function LoginPage() {
  const { login } = useAuth()
  const location = useLocation() as { state?: { from?: string } }
  const registration = useRegistrationState()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useAuthSubmit(() => login(email, password), location.state?.from || '/')

  return (
    <AuthLayout>
      <h1 style={{ marginBottom: 6 }}>Welcome back</h1>
      <p className="muted" style={{ marginBottom: 22 }}>
        Sign in to your forms and responses.
      </p>

      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && <p className="field-error">{error}</p>}

        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Only ever offer registration when it could actually succeed: on a
          brand-new instance that still needs its first administrator. */}
      <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
        {registration?.firstRun ? (
          <>
            Setting this up for the first time? <Link to="/register">Create the administrator account</Link>
          </>
        ) : (
          'Accounts are created by invitation. Ask an administrator if you need access.'
        )}
      </p>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('invite') || ''
  const registration = useRegistrationState(token || undefined)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useAuthSubmit(() => register(email, password, name, token || undefined), '/')

  // The invite already names its recipient, and the server insists the two
  // match, so pre-fill it rather than inviting a typo.
  useEffect(() => {
    if (registration?.invite?.email) setEmail(registration.invite.email)
  }, [registration?.invite?.email])

  if (!registration) {
    return (
      <AuthLayout>
        <div className="page-loading">
          <div className="spinner" />
        </div>
      </AuthLayout>
    )
  }

  const firstRun = registration.firstRun
  const validInvite = !!registration.invite

  // No invite and not a first run: there is nothing to fill in, so say so
  // plainly instead of showing a form that cannot be submitted.
  if (!firstRun && !validInvite) {
    return (
      <AuthLayout>
        <h1 style={{ marginBottom: 6 }}>This instance is invite-only</h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          {token
            ? 'That invitation link has already been used, was withdrawn, or has expired. Ask an administrator for a new one.'
            : 'Accounts here are created by an administrator. Ask them to send you an invitation link.'}
        </p>
        <Link className="btn btn-primary btn-lg btn-block" to="/login">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 style={{ marginBottom: 6 }}>
        {firstRun ? 'Create the administrator account' : 'Accept your invitation'}
      </h1>
      <p className="muted" style={{ marginBottom: 22 }}>
        {firstRun ? (
          'This is the first account on this instance, so it becomes the administrator — the person who invites everyone else.'
        ) : registration.invite?.groupName ? (
          <>
            You have been invited to join <b>{registration.invite.groupName}</b>.
          </>
        ) : (
          'You have been invited to this instance.'
        )}
      </p>

      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            // An invitation is issued to one address and only works for that
            // address, so there is nothing to choose here.
            readOnly={validInvite}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {validInvite && <p className="field-hint">Your invitation was issued to this address.</p>}
        </div>

        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="field-hint">At least 10 characters. A short phrase works well.</p>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Creating account…' : firstRun ? 'Create administrator account' : 'Accept invitation'}
        </button>
      </form>

      <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
