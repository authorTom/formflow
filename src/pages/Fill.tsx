import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { FileQuestion, Lock } from 'lucide-react'
import { FormRunner } from '../components/FormRunner'
import { api, ApiError } from '../lib/api'
import type { PublicForm } from '../lib/types'

/** The respondent-facing page at /f/:slug — and /preview/:slug for the owner. */
export function FillPage({ preview = false }: { preview?: boolean }) {
  // Live forms are addressed by slug; owner previews by form id, so a draft can
  // be tried before it is published.
  const { slug = '', id = '' } = useParams()
  const location = useLocation()
  const [form, setForm] = useState<PublicForm | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(preview ? api.previewForm(id) : api.publicForm(slug))
      .then((data) => {
        if (cancelled) return
        setForm(data.form)
        document.title = data.form.title || 'FormFlow'
      })
      .catch((err) => {
        if (cancelled) return
        // A form restricted to signed-in people is not an error — it is a
        // detour. Remember where they were headed so sign-in returns them here.
        if (err instanceof ApiError && err.requiresAuth) {
          setNeedsSignIn(true)
          return
        }
        setFailure(err instanceof ApiError ? err.message : 'Could not load this form.')
      })
    return () => {
      cancelled = true
    }
  }, [slug, id, preview])

  if (needsSignIn) {
    return (
      <div className="center" style={{ minHeight: '100vh', padding: 24 }}>
        <div className="empty" style={{ maxWidth: 440, border: 0 }}>
          <span className="empty-mark">
            <Lock size={22} />
          </span>
          <h1 style={{ fontSize: '1.3rem' }}>Sign in to continue</h1>
          <p className="muted small">
            This form is for people inside the organisation, so it needs an account. You will come straight
            back here.
          </p>
          <Link
            className="btn btn-primary btn-lg"
            to="/login"
            state={{ from: `${location.pathname}${location.search}` }}
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (failure) {
    return (
      <div className="center" style={{ minHeight: '100vh', padding: 24 }}>
        <div className="empty" style={{ maxWidth: 440, border: 0 }}>
          <span className="empty-mark">
            <FileQuestion size={22} />
          </span>
          <h1 style={{ fontSize: '1.3rem' }}>Form unavailable</h1>
          <p className="muted small">{failure}</p>
        </div>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="page-loading" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return <FormRunner form={form} preview={preview} />
}
