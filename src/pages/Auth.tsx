import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, GitBranch, Palette, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../components/AuthProvider'
import { ApiError } from '../lib/api'

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
        <h2>Forms people actually finish.</h2>
        <ul>
          <li>
            <GitBranch size={19} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>Conditional logic</b> — send people down different paths based on what they answer.
            </span>
          </li>
          <li>
            <Palette size={19} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <b>One question at a time</b> — themed, keyboard-driven, and quick on any device.
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

export function LoginPage() {
  const { login } = useAuth()
  const location = useLocation() as { state?: { from?: string } }
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

      <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
        New here? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useAuthSubmit(() => register(email, password, name), '/')

  return (
    <AuthLayout>
      <h1 style={{ marginBottom: 6 }}>Create your account</h1>
      <p className="muted" style={{ marginBottom: 22 }}>
        Build your first form in about a minute.
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="field-hint">At least 8 characters.</p>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
