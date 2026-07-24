import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Cloud, Eye, PanelRightOpen, Rocket } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { useToast } from '../components/Toast'
import { FormRunner } from '../components/FormRunner'
import { QuestionRail } from '../components/builder/QuestionRail'
import type { Selection } from '../components/builder/QuestionRail'
import { Inspector } from '../components/builder/Inspector'
import { DesignTab } from '../components/builder/DesignTab'
import { ShareTab } from '../components/builder/ShareTab'
import { WorkspaceNav } from '../components/builder/WorkspaceNav'
import type { WorkspaceTab } from '../components/builder/WorkspaceNav'
import { api, ApiError } from '../lib/api'
import type { Ending, Field, FormDoc, FormSettings, Theme, Welcome } from '../lib/types'
import { DEFAULT_SETTINGS, DEFAULT_THEME } from '../lib/types'
import { classes } from '../lib/util'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type BuilderTab = Extract<WorkspaceTab, 'build' | 'design' | 'share'>

const SAVE_DEBOUNCE_MS = 800

export function BuilderPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { error } = useToast()

  const [doc, setDoc] = useState<FormDoc | null>(null)
  const [selection, setSelection] = useState<Selection>({ kind: 'welcome' })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showInspector, setShowInspector] = useState(false)

  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState<BuilderTab>(
    tabParam === 'design' || tabParam === 'share' ? tabParam : 'build',
  )

  // Every edit bumps `revision`; a successful save records which revision it
  // wrote. The two being equal means there is nothing to save — which is also
  // how the initial load avoids triggering a pointless write.
  const revision = useRef(0)
  const savedRevision = useRef(0)

  useEffect(() => {
    let cancelled = false
    api
      .getForm(id)
      .then(({ form }) => {
        if (cancelled) return
        const normalised: FormDoc = {
          ...form,
          theme: { ...DEFAULT_THEME, ...(form.theme || {}) },
          settings: { ...DEFAULT_SETTINGS, ...(form.settings || {}) },
          // The server stores welcome as free-form JSON, so fill any gaps here
          // rather than trusting every key to exist.
          welcome: {
            enabled: form.welcome?.enabled ?? true,
            title: form.welcome?.title || form.title,
            description: form.welcome?.description || '',
            buttonText: form.welcome?.buttonText || 'Start',
          },
        }
        setDoc(normalised)
        setSelection(normalised.fields[0] ? { kind: 'field', id: normalised.fields[0].id } : { kind: 'welcome' })
      })
      .catch((err) => {
        if (cancelled) return
        error(err instanceof ApiError ? err.message : 'Could not open that form.')
        navigate('/', { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [id, error, navigate])

  const save = useCallback(
    async (next: FormDoc) => {
      setSaveState('saving')
      try {
        const { form } = await api.saveForm(next.id, {
          title: next.title,
          published: next.published,
          welcome: next.welcome,
          theme: next.theme,
          settings: next.settings,
          fields: next.fields,
          endings: next.endings,
        })
        setSaveState('saved')
        return form
      } catch (err) {
        setSaveState('error')
        error(err instanceof ApiError ? err.message : 'Could not save your changes.')
        return null
      }
    },
    [error],
  )

  // Debounced autosave: every edit schedules a write, and a new edit within the
  // window replaces it, so holding a key does not queue a request per keystroke.
  useEffect(() => {
    if (!doc || revision.current === savedRevision.current) return
    const captured = revision.current
    setSaveState('saving')

    const timer = setTimeout(async () => {
      const saved = await save(doc)
      if (!saved) return
      savedRevision.current = captured
      // The slug is the server's to decide — it re-derives from the title while
      // the form is still private, so pull it back or Share shows a dead link.
      // This does not bump `revision`, so it cannot trigger another save.
      if (saved.slug !== doc.slug) setDoc((current) => (current ? { ...current, slug: saved.slug } : current))
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [doc, save])

  // A close or reload mid-debounce would silently lose the last edit.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === 'saving') event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveState])

  const update = useCallback((patch: Partial<FormDoc>) => {
    revision.current += 1
    setDoc((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const updateField = useCallback(
    (field: Field) => {
      if (!doc) return
      update({ fields: doc.fields.map((item) => (item.id === field.id ? field : item)) })
    },
    [doc, update],
  )

  const updateEnding = useCallback(
    (ending: Ending) => {
      if (!doc) return
      update({ endings: doc.endings.map((item) => (item.id === ending.id ? ending : item)) })
    },
    [doc, update],
  )

  const switchTab = (next: WorkspaceTab) => {
    if (next === 'build' || next === 'design' || next === 'share') setTab(next)
  }

  if (!doc) {
    return (
      <div className="app-shell">
        <AppHeader />
        <div className="page-loading">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const focus =
    selection.kind === 'field'
      ? ({ kind: 'field', index: Math.max(0, doc.fields.findIndex((f) => f.id === selection.id)) } as const)
      : selection.kind === 'ending'
        ? ({ kind: 'ending', id: selection.id } as const)
        : ({ kind: 'welcome' } as const)

  return (
    <div className="app-shell">
      <AppHeader
        center={
          <>
            <input
              className="header-title grow"
              value={doc.title}
              onChange={(event) => update({ title: event.target.value })}
              aria-label="Form title"
              placeholder="Untitled form"
            />
            <span className="header-sep hidden-sm">/</span>
            <WorkspaceNav formId={doc.id} active={tab} onSelectTab={switchTab} />
          </>
        }
        right={
          <>
            <SaveBadge state={saveState} />
            <a
              className="btn"
              href={`/preview/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              title="Open a live preview in a new tab"
            >
              <Eye size={15} />
              <span className="hidden-sm">Preview</span>
            </a>
            <button
              className={doc.published ? 'btn' : 'btn btn-primary'}
              onClick={() => update({ published: !doc.published })}
            >
              <Rocket size={15} />
              {doc.published ? 'Unpublish' : 'Publish'}
            </button>
          </>
        }
      />

      {tab === 'build' && (
        <div className={classes('builder', showInspector && 'show-inspector')}>
          <QuestionRail
            fields={doc.fields}
            endings={doc.endings}
            selection={selection}
            welcomeEnabled={!!doc.welcome.enabled}
            onSelect={setSelection}
            onFieldsChange={(fields) => update({ fields })}
            onEndingsChange={(endings) => update({ endings })}
          />

          <div className="builder-canvas">
            <div className="canvas-bar">
              <span className="muted small">
                Live preview — this is what respondents see. Nothing here is recorded.
              </span>
              <button
                className="btn btn-sm"
                onClick={() => setShowInspector((open) => !open)}
                style={{ display: 'none' }}
                data-mobile-toggle
              >
                <PanelRightOpen size={14} />
                Settings
              </button>
            </div>
            <div className="canvas-frame">
              <FormRunner form={doc} preview embedded focus={focus} />
            </div>
          </div>

          <Inspector
            doc={doc}
            selection={selection}
            onFieldChange={updateField}
            onEndingChange={updateEnding}
            onWelcomeChange={(welcome: Welcome) => update({ welcome })}
            onFieldsChange={(fields) => update({ fields })}
          />
        </div>
      )}

      {tab === 'design' && (
        <DesignTab
          doc={doc}
          onThemeChange={(theme: Theme) => update({ theme })}
          onSettingsChange={(settings: FormSettings) => update({ settings })}
        />
      )}

      {tab === 'share' && <ShareTab doc={doc} onPublishChange={(published) => update({ published })} />}
    </div>
  )
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  if (state === 'error') return <span className="badge badge-draft">Not saved</span>
  return (
    <span className="badge" title={state === 'saving' ? 'Saving your changes' : 'All changes saved'}>
      {state === 'saving' ? <Cloud size={12} /> : <Check size={12} />}
      <span className="hidden-sm">{state === 'saving' ? 'Saving…' : 'Saved'}</span>
    </span>
  )
}
