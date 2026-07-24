import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Copy,
  ExternalLink,
  FilePlus2,
  Inbox,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { api, ApiError } from '../lib/api'
import type { FormSummary } from '../lib/types'
import { formatRelative, percent } from '../lib/util'
import { mergeTheme } from '../lib/theme'

export function DashboardPage() {
  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FormSummary | null>(null)
  const { toast, error } = useToast()
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

  const createForm = async () => {
    setCreating(true)
    try {
      const { form } = await api.createForm('Untitled form')
      navigate(`/forms/${form.id}`)
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not create the form.')
    } finally {
      setCreating(false)
    }
  }

  const duplicate = async (form: FormSummary) => {
    try {
      await api.duplicateForm(form.id)
      toast(`Duplicated “${form.title}”`)
      load()
    } catch {
      error('Could not duplicate that form.')
    }
  }

  const remove = async (form: FormSummary) => {
    try {
      await api.deleteForm(form.id)
      setForms((current) => (current || []).filter((item) => item.id !== form.id))
      toast('Form deleted')
    } catch {
      error('Could not delete that form.')
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
          <button className="btn btn-primary" onClick={createForm} disabled={creating}>
            <Plus size={16} />
            New form
          </button>
        }
      />

      <main className="page">
        <div className="page-head">
          <div>
            <h1>Your forms</h1>
            <p className="muted small">
              {forms == null
                ? 'Loading…'
                : forms.length === 0
                  ? 'Nothing here yet.'
                  : `${forms.length} form${forms.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {forms == null ? (
          <div className="form-grid">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton" style={{ height: 168, borderRadius: 14 }} />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="empty">
            <span className="empty-mark">
              <FilePlus2 size={22} />
            </span>
            <div>
              <h2 style={{ marginBottom: 4 }}>Create your first form</h2>
              <p className="muted small" style={{ maxWidth: '34em' }}>
                Add questions, branch with logic, theme it to match your brand, then share a link. Responses
                and analytics land here.
              </p>
            </div>
            <button className="btn btn-primary btn-lg" onClick={createForm} disabled={creating}>
              <Plus size={17} />
              New form
            </button>
          </div>
        ) : (
          <div className="form-grid">
            {forms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onDuplicate={() => duplicate(form)}
                onDelete={() => setPendingDelete(form)}
                onCopyLink={() => copyLink(form)}
              />
            ))}
          </div>
        )}
      </main>

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
  onDuplicate: () => void
  onDelete: () => void
  onCopyLink: () => void
}

function FormCard({ form, onDuplicate, onDelete, onCopyLink }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const theme = mergeTheme(form.theme)
  const { starts, completions, views, fields } = form.stats

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
                  Edit
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
                <hr className="divider" style={{ margin: '4px 0' }} />
                <button className="menu-item menu-item-danger" onClick={onDelete}>
                  <Trash2 size={15} />
                  Delete
                </button>
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
          {fields} question{fields === 1 ? '' : 's'} · edited {formatRelative(form.updatedAt)}
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
