// Instance administration: who has an account, who is waiting on an invitation,
// what groups exist, and what has been done to any of it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Copy,
  KeyRound,
  Mail,
  MonitorSmartphone,
  Plus,
  ScrollText,
  ShieldAlert,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAuth } from '../components/AuthProvider'
import { api, ApiError } from '../lib/api'
import type { AdminUser, AuditEntry, Group, GroupRole, InstanceOverview, Invite, SystemRole } from '../lib/types'
import { formatRelative, formatUntil } from '../lib/util'

type Tab = 'users' | 'invites' | 'groups' | 'audit'

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'users', label: 'People', icon: Users },
  { id: 'invites', label: 'Invitations', icon: Mail },
  { id: 'groups', label: 'Groups', icon: UserCog },
  { id: 'audit', label: 'Activity', icon: ScrollText },
]

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users')
  const [overview, setOverview] = useState<InstanceOverview | null>(null)

  const loadOverview = useCallback(() => {
    api.adminOverview().then(setOverview).catch(() => setOverview(null))
  }, [])
  useEffect(loadOverview, [loadOverview])

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Administration</h1>
            <p className="muted small">Accounts, groups and access for this instance.</p>
          </div>
        </div>

        {overview && <Overview overview={overview} />}

        <div className="tabbar" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'users' && <PeopleTab onChange={loadOverview} />}
        {tab === 'invites' && <InvitesTab onChange={loadOverview} />}
        {tab === 'groups' && <GroupsTab onChange={loadOverview} />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  )
}

function Overview({ overview }: { overview: InstanceOverview }) {
  return (
    <div className="stat-row">
      <Stat label="People" value={overview.users} hint={`${overview.admins} administrator${overview.admins === 1 ? '' : 's'}`} />
      <Stat label="Groups" value={overview.groups} />
      <Stat label="Forms" value={overview.forms} hint={`${overview.responses} responses`} />
      <Stat
        label="Open to anyone"
        value={overview.openForms}
        hint={overview.openForms ? 'published without sign-in' : 'all forms need a sign-in'}
        warn={overview.openForms > 0}
      />
      <Stat label="Pending invites" value={overview.pendingInvites} />
      <Stat label="Suspended" value={overview.suspended} warn={overview.suspended > 0} />
    </div>
  )
}

function Stat({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className={`stat-card ${warn ? 'stat-card-warn' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {hint && <em className="muted tiny">{hint}</em>}
    </div>
  )
}

// --- People -----------------------------------------------------------------

function PeopleTab({ onChange }: { onChange: () => void }) {
  const { user: me } = useAuth()
  const { toast, error } = useToast()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)

  const load = useCallback(() => {
    api
      .adminUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => error(err instanceof ApiError ? err.message : 'Could not load accounts.'))
  }, [error])
  useEffect(load, [load])

  const patch = async (user: AdminUser, body: Parameters<typeof api.updateUser>[1], message: string) => {
    try {
      await api.updateUser(user.id, body)
      toast(message)
      load()
      onChange()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not update that account.')
    }
  }

  const remove = async (user: AdminUser) => {
    try {
      await api.deleteUser(user.id)
      toast(`Deleted ${user.email}`)
      load()
      onChange()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not delete that account.')
    }
  }

  if (!users) return <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Groups</th>
              <th>Status</th>
              <th>Added</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={user.status === 'suspended' ? 'row-muted' : ''}>
                <td>
                  <b>{user.name || user.email.split('@')[0]}</b>
                  <div className="muted tiny">{user.email}</div>
                </td>
                <td>
                  <select
                    className="input input-sm"
                    value={user.role}
                    onChange={(event) =>
                      patch(user, { role: event.target.value as SystemRole }, `${user.email} is now a ${event.target.value}`)
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Administrator</option>
                  </select>
                </td>
                <td>
                  {user.groups.length === 0 ? (
                    <span className="muted tiny">None</span>
                  ) : (
                    <div className="chip-row">
                      {user.groups.map((group) => (
                        <Link key={group.id} className="chip" to={`/groups/${group.id}`}>
                          {group.name}
                          <em>{group.role}</em>
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <span className={user.status === 'active' ? 'badge badge-live' : 'badge badge-draft'}>
                    {user.status === 'active' ? 'Active' : 'Suspended'}
                  </span>
                  {user.activeSessions > 0 && (
                    <div className="muted tiny">
                      {user.activeSessions} session{user.activeSessions === 1 ? '' : 's'}
                    </div>
                  )}
                </td>
                <td className="muted tiny">{formatRelative(user.createdAt)}</td>
                <td>
                  <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Set a new password"
                      onClick={() => setResetting(user)}
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Sign them out everywhere"
                      disabled={!user.activeSessions}
                      onClick={async () => {
                        await api.revokeUserSessions(user.id).catch(() => undefined)
                        toast(`Signed ${user.email} out everywhere`)
                        load()
                      }}
                    >
                      <MonitorSmartphone size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title={user.status === 'active' ? 'Suspend' : 'Reactivate'}
                      onClick={() =>
                        patch(
                          user,
                          { status: user.status === 'active' ? 'suspended' : 'active' },
                          user.status === 'active' ? `Suspended ${user.email}` : `Reactivated ${user.email}`,
                        )
                      }
                    >
                      <ShieldAlert size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm menu-item-danger"
                      title="Delete account"
                      disabled={user.id === me?.id}
                      onClick={() => setPendingDelete(user)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetting && (
        <PasswordResetDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null)
            load()
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.email}?`}
          message={
            `Their account and sessions are removed immediately. ` +
            `${pendingDelete.formCount > 0 ? `The ${pendingDelete.formCount} form${pendingDelete.formCount === 1 ? '' : 's'} they created stay with their group, along with all responses. ` : ''}` +
            `This cannot be undone.`
          }
          confirmLabel="Delete account"
          danger
          onConfirm={() => remove(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}

function PasswordResetDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const { toast, error } = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.resetUserPassword(user.id, password)
      toast(`Password set for ${user.email}. They have been signed out everywhere.`)
      onDone()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not set that password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Set a new password for ${user.email}`} onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <p className="muted small">
          Give them this password over a channel you trust, and ask them to change it once they are in.
          Every existing session for the account is ended.
        </p>
        <div>
          <label className="field-label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className="input"
            type="text"
            required
            minLength={10}
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="field-hint">At least 10 characters.</p>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Setting…' : 'Set password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// --- Invitations ------------------------------------------------------------

function InvitesTab({ onChange }: { onChange: () => void }) {
  const { toast, error } = useToast()
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(() => {
    api.listInvites().then((data) => setInvites(data.invites)).catch(() => setInvites([]))
    api.listGroups().then((data) => setGroups(data.groups)).catch(() => setGroups([]))
  }, [])
  useEffect(load, [load])

  const link = (invite: Invite) => `${location.origin}/register?invite=${invite.token}`

  const copy = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(link(invite))
      setCopied(invite.token)
      setTimeout(() => setCopied(''), 1600)
      toast('Invitation link copied — send it to them directly')
    } catch {
      error(link(invite))
    }
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <p className="muted small" style={{ maxWidth: '48em' }}>
          An invitation works once, only for the address it was issued to, and expires. There is no mail
          server here — copy the link and send it however you normally would.
        </p>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Invite someone
        </button>
      </div>

      {!invites ? (
        <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />
      ) : invites.length === 0 ? (
        <div className="empty">
          <span className="empty-mark">
            <Mail size={22} />
          </span>
          <div>
            <h2 style={{ marginBottom: 4 }}>No invitations yet</h2>
            <p className="muted small">Invite a colleague to give them an account on this instance.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Joins</th>
                <th>Role</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.token} className={invite.status === 'pending' ? '' : 'row-muted'}>
                  <td>
                    <b>{invite.email}</b>
                    <div className="muted tiny">invited {formatRelative(invite.createdAt)}</div>
                  </td>
                  <td>
                    {invite.groupName ? (
                      <>
                        {invite.groupName} <span className="muted tiny">as {invite.groupRole}</span>
                      </>
                    ) : (
                      <span className="muted tiny">No group</span>
                    )}
                  </td>
                  <td>{invite.role === 'admin' ? 'Administrator' : 'Member'}</td>
                  <td>
                    <span className={`badge ${invite.status === 'pending' ? 'badge-live' : 'badge-draft'}`}>
                      {invite.status === 'pending'
                        ? `Expires ${formatUntil(invite.expiresAt)}`
                        : invite.status === 'accepted'
                          ? 'Accepted'
                          : 'Expired'}
                    </span>
                  </td>
                  <td>
                    {invite.status === 'pending' && (
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => copy(invite)}>
                          {copied === invite.token ? <Check size={14} /> : <Copy size={14} />}
                          Copy link
                        </button>
                        <button
                          className="btn btn-ghost btn-sm menu-item-danger"
                          title="Withdraw"
                          onClick={async () => {
                            await api.revokeInvite(invite.token).catch(() => undefined)
                            toast('Invitation withdrawn')
                            load()
                            onChange()
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <InviteDialog
          groups={groups}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            load()
            onChange()
          }}
        />
      )}
    </>
  )
}

function InviteDialog({ groups, onClose, onCreated }: { groups: Group[]; onClose: () => void; onCreated: () => void }) {
  const { toast, error } = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<SystemRole>('member')
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
  const [groupRole, setGroupRole] = useState<GroupRole>('editor')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { invite } = await api.createInvite({ email, role, groupId: groupId || null, groupRole })
      await navigator.clipboard
        .writeText(`${location.origin}/register?invite=${invite.token}`)
        .then(() => toast('Invitation created — link copied to your clipboard'))
        .catch(() => toast('Invitation created. Use “Copy link” to get the URL.'))
      onCreated()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not create that invitation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Invite someone" onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="invite-email">
            Their email
          </label>
          <input
            id="invite-email"
            className="input"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <p className="field-hint">The invitation will only work for this address.</p>
        </div>

        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <div className="grow">
            <label className="field-label" htmlFor="invite-group">
              Add to group
            </label>
            <select
              id="invite-group"
              className="input"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grow">
            <label className="field-label" htmlFor="invite-group-role">
              As
            </label>
            <select
              id="invite-group-role"
              className="input"
              value={groupRole}
              disabled={!groupId}
              onChange={(event) => setGroupRole(event.target.value as GroupRole)}
            >
              <option value="viewer">Viewer — read results</option>
              <option value="editor">Editor — build forms</option>
              <option value="manager">Manager — run the group</option>
            </select>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="invite-role">
            Instance role
          </label>
          <select
            id="invite-role"
            className="input"
            value={role}
            onChange={(event) => setRole(event.target.value as SystemRole)}
          >
            <option value="member">Member</option>
            <option value="admin">Administrator — full control of this instance</option>
          </select>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create invitation'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// --- Groups -----------------------------------------------------------------

function GroupsTab({ onChange }: { onChange: () => void }) {
  const { toast, error } = useToast()
  const { refresh } = useAuth()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null)

  const load = useCallback(() => {
    api.listGroups().then((data) => setGroups(data.groups)).catch(() => setGroups([]))
  }, [])
  useEffect(load, [load])

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <p className="muted small" style={{ maxWidth: '48em' }}>
          Every form belongs to a group. People see a group's forms and results according to their role in
          it.
        </p>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          New group
        </button>
      </div>

      {!groups ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />
      ) : (
        <div className="form-grid">
          {groups.map((group) => (
            <article key={group.id} className="form-card">
              <div className="row-between">
                <Link to={`/groups/${group.id}`} className="form-card-title">
                  {group.name}
                </Link>
                <button
                  className="btn btn-ghost btn-icon menu-item-danger"
                  title="Delete group"
                  onClick={() => setPendingDelete(group)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {group.description && <p className="muted small">{group.description}</p>}
              <div className="form-card-stats">
                <span className="stat-inline">
                  <b>{group.memberCount}</b>
                  <span>People</span>
                </span>
                <span className="stat-inline">
                  <b>{group.formCount}</b>
                  <span>Forms</span>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <GroupDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            load()
            onChange()
            refresh()
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          message="Everyone is removed from the group. A group that still owns forms cannot be deleted — move or delete those first."
          confirmLabel="Delete group"
          danger
          onConfirm={async () => {
            try {
              await api.deleteGroup(pendingDelete.id)
              toast('Group deleted')
              load()
              onChange()
              refresh()
            } catch (err) {
              error(err instanceof ApiError ? err.message : 'Could not delete that group.')
            }
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}

function GroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { error } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.createGroup(name, description)
      onCreated()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not create that group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="New group" onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="group-name">
            Name
          </label>
          <input
            id="group-name"
            className="input"
            required
            autoFocus
            placeholder="Support, People Ops, Engineering…"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="group-desc">
            Description
          </label>
          <input
            id="group-desc"
            className="input"
            placeholder="Optional"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <p className="field-hint">You become its first manager, and can add anyone else afterwards.</p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// --- Activity ---------------------------------------------------------------

/** Turns an action key into something readable without a lookup table per verb. */
function describe(entry: AuditEntry) {
  const detail = entry.detail as Record<string, string | number | boolean>
  const parts = Object.entries(detail)
    .filter(([key]) => !['ip'].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
  return parts.join(' · ')
}

const ACTION_LABELS: Record<string, string> = {
  'instance.bootstrap': 'Instance set up',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_blocked': 'Blocked sign-in',
  'user.register': 'Accepted invitation',
  'user.updated': 'Account changed',
  'user.deleted': 'Account deleted',
  'user.password_changed': 'Password changed',
  'user.password_reset': 'Password reset by admin',
  'user.sessions_revoked': 'Sessions revoked',
  'invite.created': 'Invitation created',
  'invite.revoked': 'Invitation withdrawn',
  'group.created': 'Group created',
  'group.updated': 'Group changed',
  'group.deleted': 'Group deleted',
  'group.member_added': 'Added to group',
  'group.member_removed': 'Removed from group',
  'group.member_role_changed': 'Group role changed',
  'form.created': 'Form created',
  'form.deleted': 'Form deleted',
  'form.duplicated': 'Form duplicated',
  'form.moved': 'Form moved',
  'form.shared': 'Form shared',
  'form.unshared': 'Sharing removed',
  'form.access_changed': 'Form access changed',
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.auditLog().then((data) => setEntries(data.entries)).catch(() => setEntries([]))
  }, [])

  const shown = useMemo(() => {
    if (!entries) return null
    const needle = filter.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) =>
      `${entry.actorEmail} ${entry.action} ${ACTION_LABELS[entry.action] ?? ''} ${describe(entry)}`
        .toLowerCase()
        .includes(needle),
    )
  }, [entries, filter])

  if (!shown) return <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <p className="muted small" style={{ maxWidth: '48em' }}>
          Account, group and sharing changes, plus sign-ins. Form edits and responses are not recorded here.
        </p>
        <input
          className="input input-sm"
          style={{ maxWidth: 260 }}
          placeholder="Filter…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.id}>
                <td className="muted tiny" title={entry.at}>
                  {formatRelative(entry.at)}
                </td>
                <td>{entry.actorEmail}</td>
                <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td className="muted tiny">{describe(entry)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="muted small" style={{ textAlign: 'center', padding: 24 }}>
                  Nothing matches that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
