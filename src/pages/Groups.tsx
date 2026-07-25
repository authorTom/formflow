// Groups the signed-in user belongs to, and the detail screen a manager uses to
// run one of them. Administrators see every group here.

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, UserMinus, UserPlus, Users } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAuth } from '../components/AuthProvider'
import { api, ApiError } from '../lib/api'
import type { Group, GroupDetail, GroupMember, GroupRole } from '../lib/types'
import { formatRelative } from '../lib/util'

const ROLE_HELP: Record<GroupRole, string> = {
  manager: 'Runs the group: adds and removes people, and fully controls its forms.',
  editor: 'Builds and edits the group’s forms, and reads their results.',
  viewer: 'Reads results only — cannot change a form.',
}

export function GroupsPage() {
  const { isAdmin } = useAuth()
  const [groups, setGroups] = useState<Group[] | null>(null)

  useEffect(() => {
    api.listGroups().then((data) => setGroups(data.groups)).catch(() => setGroups([]))
  }, [])

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Groups</h1>
            <p className="muted small">
              {isAdmin ? 'Every group on this instance.' : 'The groups you belong to.'}
            </p>
          </div>
        </div>

        {!groups ? (
          <div className="form-grid">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton" style={{ height: 140, borderRadius: 14 }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="empty">
            <span className="empty-mark">
              <Users size={22} />
            </span>
            <div>
              <h2 style={{ marginBottom: 4 }}>You are not in any groups yet</h2>
              <p className="muted small" style={{ maxWidth: '34em' }}>
                Forms belong to groups. Ask an administrator to add you to one.
              </p>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            {groups.map((group) => (
              <Link key={group.id} to={`/groups/${group.id}`} className="form-card" style={{ textDecoration: 'none' }}>
                <div className="row-between">
                  <span className="form-card-title">{group.name}</span>
                  {group.role && <span className="badge badge-draft">{group.role}</span>}
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
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export function GroupDetailPage() {
  const { id = '' } = useParams()
  const { refresh, user } = useAuth()
  const { toast, error } = useToast()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<GroupMember | null>(null)

  const load = useCallback(() => {
    api
      .getGroup(id)
      .then(setDetail)
      .catch((err) => {
        error(err instanceof ApiError ? err.message : 'Could not load that group.')
        navigate('/groups', { replace: true })
      })
  }, [id, error, navigate])
  useEffect(load, [load])

  if (!detail) {
    return (
      <div className="app-shell">
        <AppHeader />
        <main className="page">
          <div className="skeleton" style={{ height: 260, borderRadius: 14 }} />
        </main>
      </div>
    )
  }

  const isManager = detail.group.role === 'manager'

  const setRole = async (member: GroupMember, role: GroupRole) => {
    try {
      const { members } = await api.setMemberRole(id, member.id, role)
      setDetail({ ...detail, members })
      toast(`${member.email} is now a ${role}`)
      if (member.id === user?.id) refresh()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not change that role.')
    }
  }

  const remove = async (member: GroupMember) => {
    try {
      await api.removeMember(id, member.id)
      toast(`Removed ${member.email}`)
      load()
      if (member.id === user?.id) refresh()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not remove them.')
    }
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="page">
        <Link to="/groups" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={15} />
          All groups
        </Link>

        <div className="page-head">
          <div>
            <h1>{detail.group.name}</h1>
            <p className="muted small">
              {detail.group.description || 'No description.'} · you are a {detail.group.role}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {isManager && (
              <button className="btn" onClick={() => setRenaming(true)}>
                <Pencil size={15} />
                Edit details
              </button>
            )}
            {isManager && (
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                <UserPlus size={16} />
                Add someone
              </button>
            )}
          </div>
        </div>

        <section className="card card-pad col" style={{ gap: 4, marginBottom: 18 }}>
          <div className="row" style={{ gap: 8 }}>
            <FileText size={16} />
            <p className="small">
              Forms owned by this group are visible to everyone listed below, according to their role.
            </p>
          </div>
        </section>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role in this group</th>
                <th>Joined</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {detail.members.map((member) => (
                <tr key={member.id} className={member.status === 'suspended' ? 'row-muted' : ''}>
                  <td>
                    <b>{member.name || member.email.split('@')[0]}</b>
                    <div className="muted tiny">
                      {member.email}
                      {member.systemRole === 'admin' && ' · administrator'}
                      {member.status === 'suspended' && ' · suspended'}
                    </div>
                  </td>
                  <td>
                    {isManager ? (
                      <select
                        className="input input-sm"
                        value={member.role}
                        onChange={(event) => setRole(member, event.target.value as GroupRole)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="manager">Manager</option>
                      </select>
                    ) : (
                      member.role
                    )}
                    <div className="muted tiny">{ROLE_HELP[member.role]}</div>
                  </td>
                  <td className="muted tiny">{formatRelative(member.joinedAt)}</td>
                  <td>
                    {isManager && (
                      <button
                        className="btn btn-ghost btn-sm menu-item-danger"
                        title="Remove from group"
                        style={{ float: 'right' }}
                        onClick={() => setPendingRemove(member)}
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {adding && (
        <AddMemberDialog
          detail={detail}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            load()
          }}
        />
      )}

      {renaming && (
        <EditGroupDialog
          detail={detail}
          onClose={() => setRenaming(false)}
          onSaved={() => {
            setRenaming(false)
            load()
            refresh()
          }}
        />
      )}

      {pendingRemove && (
        <ConfirmDialog
          title={`Remove ${pendingRemove.email}?`}
          message={
            pendingRemove.id === user?.id
              ? 'You will lose access to this group’s forms and results immediately.'
              : 'They lose access to this group’s forms and results immediately. Their account stays.'
          }
          confirmLabel="Remove"
          danger
          onConfirm={() => remove(pendingRemove)}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  )
}

function AddMemberDialog({
  detail,
  onClose,
  onAdded,
}: {
  detail: GroupDetail
  onClose: () => void
  onAdded: () => void
}) {
  const { error } = useToast()
  const [userId, setUserId] = useState(detail.candidates[0]?.id ?? '')
  const [role, setRole] = useState<GroupRole>('editor')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.addMember(detail.group.id, userId, role)
      onAdded()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not add them.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Add someone to ${detail.group.name}`} onClose={onClose}>
      {detail.candidates.length === 0 ? (
        <div className="col" style={{ gap: 14 }}>
          <p className="muted small">
            Everyone with an account is already in this group. Invite a new person from the administration
            screen.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="col" style={{ gap: 14 }}>
          <div>
            <label className="field-label" htmlFor="member-user">
              Person
            </label>
            <select
              id="member-user"
              className="input"
              value={userId}
              autoFocus
              onChange={(event) => setUserId(event.target.value)}
            >
              {detail.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name ? `${candidate.name} — ${candidate.email}` : candidate.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="member-role">
              Role
            </label>
            <select
              id="member-role"
              className="input"
              value={role}
              onChange={(event) => setRole(event.target.value as GroupRole)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="manager">Manager</option>
            </select>
            <p className="field-hint">{ROLE_HELP[role]}</p>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy || !userId}>
              {busy ? 'Adding…' : 'Add to group'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function EditGroupDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: GroupDetail
  onClose: () => void
  onSaved: () => void
}) {
  const { error } = useToast()
  const [name, setName] = useState(detail.group.name)
  const [description, setDescription] = useState(detail.group.description)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.updateGroup(detail.group.id, { name, description })
      onSaved()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not save those details.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Group details" onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="edit-group-name">
            Name
          </label>
          <input
            id="edit-group-name"
            className="input"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="edit-group-desc">
            Description
          </label>
          <input
            id="edit-group-desc"
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
