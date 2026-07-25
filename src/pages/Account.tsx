// The signed-in user's own account: their name, their password, and the ability
// to end every session they have open.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, LogOut, ShieldCheck, Users } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { useToast } from '../components/Toast'
import { useAuth } from '../components/AuthProvider'
import { api, ApiError } from '../lib/api'

export function AccountPage() {
  const { user, groups, isAdmin, refresh, logout } = useAuth()
  const { toast, error } = useToast()

  const [name, setName] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingName(true)
    try {
      await api.updateProfile(name)
      await refresh()
      toast('Name updated')
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not save your name.')
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingPassword(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      toast('Password changed. Any other browser signed in as you has been signed out.')
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not change your password.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="page page-narrow">
        <div className="page-head">
          <div>
            <h1>Your account</h1>
            <p className="muted small">{user?.email}</p>
          </div>
        </div>

        <section className="card card-pad col" style={{ gap: 14 }}>
          <h2>Details</h2>
          <form onSubmit={saveName} className="col" style={{ gap: 12 }}>
            <div>
              <label className="field-label" htmlFor="account-name">
                Name
              </label>
              <input
                id="account-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="field-hint">Shown to colleagues on group and response screens.</p>
            </div>
            <div>
              <button className="btn btn-primary" disabled={savingName}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </section>

        <section className="card card-pad col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <ShieldCheck size={17} />
            <h2>Access</h2>
          </div>
          <p className="small">
            You are {isAdmin ? 'an administrator of this instance' : 'a member of this instance'}.
            {isAdmin && (
              <>
                {' '}
                <Link to="/admin">Open administration</Link>.
              </>
            )}
          </p>
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>
              <Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
              Your groups
            </div>
            {groups.length === 0 ? (
              <p className="muted small">
                You are not in any groups yet, so there is nothing to build in. Ask an administrator to add
                you to one.
              </p>
            ) : (
              <div className="chip-row">
                {groups.map((group) => (
                  <Link key={group.id} className="chip" to={`/groups/${group.id}`}>
                    {group.name}
                    <em>{group.role}</em>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card card-pad col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <KeyRound size={17} />
            <h2>Password</h2>
          </div>
          <form onSubmit={savePassword} className="col" style={{ gap: 12 }}>
            <div>
              <label className="field-label" htmlFor="current-password">
                Current password
              </label>
              <input
                id="current-password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="account-new-password">
                New password
              </label>
              <input
                id="account-new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p className="field-hint">
                At least 10 characters. Changing it signs out every other browser you are signed in on.
              </p>
            </div>
            <div>
              <button className="btn btn-primary" disabled={savingPassword}>
                {savingPassword ? 'Changing…' : 'Change password'}
              </button>
            </div>
          </form>
        </section>

        <section className="card card-pad col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <LogOut size={17} />
            <h2>Sessions</h2>
          </div>
          <p className="small">
            Signed in somewhere you no longer have access to — an old laptop, a shared machine? End every
            session, including this one.
          </p>
          <div>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api.logoutEverywhere().catch(() => undefined)
                await logout()
              }}
            >
              Sign out everywhere
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
