import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Copy,
  ExternalLink,
  FilePlus2,
  Globe,
  Inbox,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAuth } from '../components/AuthProvider'
import { api, ApiError } from '../lib/api'
import type { FormSummary, Group } from '../lib/types'
import { formatRelative, percent } from '../lib/util'
import { mergeTheme } from '../lib/theme'

export function DashboardPage() {
  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [choosingGroup, setChoosingGroup] = useState(false)
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [pendingDelete, setPendingDelete] = useState<FormSummary | null>(null)
  const { toast, error } = useToast()
  const { groups, writableGroups, isAdmin } = useAuth()
  const navigate = useNavigate()

  const load = useCallback(() => {
    api
      .listForms()
      .then((data) => setForms(data.forms))
      .catch((err) => {
        setForms([])
        error(err instanceof ApiError ? err.message : 'Could not load your forms.')
      })
  }, [error])

  useEffect(load, [load])

  // Groups worth offering as a filter: the ones the visible forms actually sit
  // in, so an admin on a large instance is not given a list of every group.
  const filterGroups = useMemo(() => {
    const seen = new Map<string, string>()
    for (const form of forms ?? []) {
      if (form.groupId) seen.set(form.groupId, form.groupName || 'Unknown group')
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [forms])

  const shown = useMemo(
    () => (forms ?? []).filter((form) => groupFilter === 'all' || form.groupId === groupFilter),
    [forms, groupFilter],
  )

  const createIn = async (groupId: string) => {
    setCreating(true)
    try {
      const { form } = await api.createForm('Untitled form', groupId)
      navigate(`/forms/${form.id}`)
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not create the form.')
    } finally {
      setCreating(false)
      setChoosingGroup(false)
    }
  }

  // An administrator can create anywhere, so they get the full list; everyone
  // else only sees groups they are a manager or editor in.
  const creatableGroups: Group[] = isAdmin ? groups : writableGroups

  const startCreate = () => {
    if (creatableGroups.length === 0) {
      error('You are not an editor in any group yet. Ask an administrator to add you to one.')
      return
    }
    // With exactly one option there is nothing to decide.
    if (creatableGroups.length === 1) return createIn(creatableGroups[0].id)
    setChoosingGroup(true)
  }

  const duplicate = async (form: FormSummary) => {
    try {
      await api.duplicateForm(form.id)
      toast(`Duplicated “${form.title}”`)
      load()
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not duplicate that form.')
    }
  }

  const remove = async (form: FormSummary) => {
    try {
      await api.deleteForm(form.id)
      setForms((current) => (current || []).filter((item) => item.id !== form.id))
      toast('Form deleted')
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not delete that form.')
    }
  }

  const copyLink = async (form: FormSummary) => {
    const url = `${location.origin}/f/${form.slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied to clipboard')
    } catch {
      error(url)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader
        right={
          <button className="btn btn-primary" onClick={startCreate} disabled={creating}>
            <Plus size={16} />
            New form
          </button>
        }
      />

      <main className="page">
        <div className="page-head">
          <div>
            <h1>Forms</h1>
            <p className="muted small">
              {forms == null
                ? 'Loading…'
                : forms.length === 0
                  ? 'Nothing here yet.'
                  : `${shown.length} form${shown.length === 1 ? '' : 's'}${
                      groupFilter === 'all' ? ' across your groups' : ''
                    }`}
            </p>
          </div>
        </div>

        {filterGroups.length > 1 && (
          <div className="tabbar" role="tablist" style={{ marginBottom: 18 }}>
            <button
              role="tab"
              aria-selected={groupFilter === 'all'}
              className={`tab ${groupFilter === 'all' ? 'active' : ''}`}
              onClick={() => setGroupFilter('all')}
            >
              All groups
            </button>
            {filterGroups.map((group) => (
              <button
                key={group.id}
                role="tab"
                aria-selected={groupFilter === group.id}
                className={`tab ${groupFilter === group.id ? 'active' : ''}`}
                onClick={() => setGroupFilter(group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>
        )}

        {forms == null ? (
          <div className="form-grid">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton" style={{ height: 168, borderRadius: 14 }} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <span className="empty-mark">
              {creatableGroups.length === 0 ? <Users size={22} /> : <FilePlus2 size={22} />}
            </span>
            <div>
              <h2 style={{ marginBottom: 4 }}>
                {creatableGroups.length === 0 ? 'Nothing to show yet' : 'Create your first form'}
              </h2>
              <p className="muted small" style={{ maxWidth: '34em' }}>
                {creatableGroups.length === 0
                  ? 'Forms belong to groups. You are not an editor in any group yet — ask an administrator to add you to one.'
                  : 'Add questions, branch with logic, theme it to match your brand, then share it with your colleagues. Responses and analytics land here.'}
              </p>
            </div>
            {creatableGroups.length > 0 && (
              <button className="btn btn-primary btn-lg" onClick={startCreate} disabled={creating}>
                <Plus size={17} />
                New form
              </button>
            )}
          </div>
        ) : (
          <div className="form-grid">
            {shown.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                showGroup={groupFilter === 'all'}
                onDuplicate={() => duplicate(form)}
                onDelete={() => setPendingDelete(form)}
                onCopyLink={() => copyLink(form)}
              />
            ))}
          </div>
        )}
      </main>

      {choosingGroup && (
        <Modal title="Which group is this form for?" onClose={() => setChoosingGroup(false)}>
          <p className="muted small" style={{ marginBottom: 14 }}>
            The group owns the form and its responses. You can share it with other groups later.
          </p>
          <div className="col" style={{ gap: 8 }}>
            {creatableGroups.map((group) => (
              <button
                key={group.id}
                className="btn btn-block"
                style={{ justifyContent: 'flex-start' }}
                disabled={creating}
                onClick={() => createIn(group.id)}
              >
                <Users size={15} />
                {group.name}
                {group.role && <span className="muted tiny">· you are a {group.role}</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this form?"
          message={`“${pendingDelete.title}” and all ${pendingDelete.stats.starts} response${
            pendingDelete.stats.starts === 1 ? '' : 's'
          } will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete form"
          danger
          onConfirm={() => remove(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

interface CardProps {
  form: FormSummary
  showGroup: boolean
  onDuplicate: () => void
  onDelete: () => void
  onCopyLink: () => void
}

function FormCard({ form, showGroup, onDuplicate, onDelete, onCopyLink }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const theme = mergeTheme(form.theme)
  const { starts, completions, views, fields } = form.stats
  const canEdit = form.permission === 'edit' || form.permission === 'manage'
  const canManage = form.permission === 'manage'

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <article className="form-card">
      <div className="row-between">
        <span className="form-card-swatch" style={{ background: theme.accent }} />
        <div className="row" style={{ gap: 6 }}>
          {/* A published form open to anyone with the link is the one state
              worth calling out on an internal instance. */}
          {form.published && (
            <span
              className={`badge ${form.access === 'link' ? 'badge-open' : 'badge-internal'}`}
              title={
                form.access === 'link'
                  ? 'Anyone with the link can respond, without signing in'
                  : 'Only signed-in people can respond'
              }
            >
              {form.access === 'link' ? <Globe size={11} /> : <Lock size={11} />}
              {form.access === 'link' ? 'Open' : 'Internal'}
            </span>
          )}
          <span className={form.published ? 'badge badge-live' : 'badge badge-draft'}>
            {form.published ? 'Live' : 'Draft'}
          </span>
          <div className="anchor" ref={menuRef}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={`Actions for ${form.title}`}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="menu">
                <Link className="menu-item" to={`/forms/${form.id}`}>
                  <Pencil size={15} />
                  {canEdit ? 'Edit' : 'Open'}
                </Link>
                <Link className="menu-item" to={`/forms/${form.id}/results`}>
                  <Inbox size={15} />
                  Responses
                </Link>
                <Link className="menu-item" to={`/forms/${form.id}/analytics`}>
                  <BarChart3 size={15} />
                  Analytics
                </Link>
                <button className="menu-item" onClick={onCopyLink}>
                  <Link2 size={15} />
                  Copy link
                </button>
                <a className="menu-item" href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  Open form
                </a>
                <button className="menu-item" onClick={onDuplicate}>
                  <Copy size={15} />
                  Duplicate
                </button>
                {canManage && (
                  <>
                    <hr className="divider" style={{ margin: '4px 0' }} />
                    <button className="menu-item menu-item-danger" onClick={onDelete}>
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <Link to={`/forms/${form.id}`} className="form-card-title">
          {form.title || 'Untitled form'}
        </Link>
        <p className="muted tiny" style={{ marginTop: 2 }}>
          {showGroup && form.groupName && (
            <>
              <Link to={`/groups/${form.groupId}`}>{form.groupName}</Link>
              {' · '}
            </>
          )}
          {fields} question{fields === 1 ? '' : 's'} · edited {formatRelative(form.updatedAt)}
          {form.permission === 'view' && ' · shared with you'}
        </p>
      </div>

      <div className="form-card-stats">
        <span className="stat-inline">
          <b>{views}</b>
          <span>Views</span>
        </span>
        <span className="stat-inline">
          <b>{completions}</b>
          <span>Done</span>
        </span>
        <span className="stat-inline">
          <b>{starts ? percent(completions / starts) : '—'}</b>
          <span>Rate</span>
        </span>
      </div>
    </article>
  )
}
