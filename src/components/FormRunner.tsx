import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, PartyPopper } from 'lucide-react'
import type { AnswerMap, AnswerValue, PublicForm } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { nextStep, progressFor } from '../lib/logic'
import { applyRecall } from '../lib/recall'
import { validateAnswer, normaliseUrl } from '../lib/validate'
import { themeStyle } from '../lib/theme'
import { api } from '../lib/api'
import { QuestionView } from './QuestionView'
import { classes } from '../lib/util'

type Screen = { kind: 'welcome' } | { kind: 'question'; index: number } | { kind: 'ending'; id: string | null }

/** What the builder wants shown, mirroring the item selected in the rail. */
export type Focus = { kind: 'welcome' } | { kind: 'field'; index: number } | { kind: 'ending'; id: string }

interface FormRunnerProps {
  form: PublicForm
  /** Preview mode never writes: no response row, no answers, no redirect. */
  preview?: boolean
  /** Renders inside the builder's frame rather than filling the viewport. */
  embedded?: boolean
  /** Builder preview only: show this screen and follow the rail's selection. */
  focus?: Focus
}

function screenForFocus(focus: Focus): Screen {
  if (focus.kind === 'field') return { kind: 'question', index: focus.index }
  if (focus.kind === 'ending') return { kind: 'ending', id: focus.id }
  return { kind: 'welcome' }
}

export function FormRunner({ form, preview = false, embedded = false, focus }: FormRunnerProps) {
  const settings = { ...DEFAULT_SETTINGS, ...(form.settings || {}) }
  const hasWelcome = !!form.welcome?.enabled

  const [screen, setScreen] = useState<Screen>(() =>
    focus ? screenForFocus(focus) : hasWelcome ? { kind: 'welcome' } : { kind: 'question', index: 0 },
  )
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [history, setHistory] = useState<number[]>([])
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [error, setError] = useState<string | null>(null)
  const [responseId, setResponseId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const startedRef = useRef(false)

  // In the builder, clicking an item in the rail shows that screen. The key is
  // a primitive so a fresh object each render does not re-trigger the effect.
  const focusKey = focus ? `${focus.kind}:${'index' in focus ? focus.index : 'id' in focus ? focus.id : ''}` : ''
  useEffect(() => {
    if (!focus) return
    setScreen(screenForFocus(focus))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusKey stands in for focus.
  }, [focusKey])

  /** Lazily creates the response row on the first real interaction. */
  const ensureResponse = useCallback(async () => {
    if (preview || responseId || startedRef.current) return responseId
    startedRef.current = true
    try {
      const { responseId: id } = await api.startResponse(form.slug)
      setResponseId(id)
      return id
    } catch {
      startedRef.current = false
      return null
    }
  }, [form.slug, preview, responseId])

  const begin = async () => {
    setDirection('forward')
    await ensureResponse()
    setScreen({ kind: 'question', index: 0 })
  }

  const currentField = screen.kind === 'question' ? form.fields[screen.index] : undefined

  const setAnswer = (value: AnswerValue) => {
    if (!currentField) return
    setAnswers((current) => ({ ...current, [currentField.id]: value }))
    setError(null)
  }

  /**
   * `override` carries the value for inputs that select and advance in one
   * gesture (choices, yes/no, ratings, scales). Their timeout fires with a
   * closure captured before the state update landed, so reading `answers` here
   * would see the previous, empty value.
   */
  const goNext = async (override?: AnswerValue) => {
    if (screen.kind !== 'question' || !currentField) return

    let value = override !== undefined ? override : (answers[currentField.id] ?? null)
    if (currentField.type === 'url' && typeof value === 'string') {
      value = normaliseUrl(value)
      setAnswers((current) => ({ ...current, [currentField.id]: value }))
    }

    const message = validateAnswer(currentField, value)
    if (message) {
      setError(message)
      return
    }

    setError(null)
    // The answer map used for logic must include this answer, which setState
    // has not flushed yet.
    const merged: AnswerMap = { ...answers, [currentField.id]: value }
    const id = await ensureResponse()
    if (id && value !== null) api.saveAnswer(id, currentField.id, value).catch(() => undefined)

    const step = nextStep(form, screen.index, merged)
    setDirection('forward')
    setHistory((stack) => [...stack, screen.index])

    if (step.kind === 'field') {
      setScreen({ kind: 'question', index: step.index })
      return
    }

    setSubmitting(true)
    if (id) await api.completeResponse(id, step.id).catch(() => undefined)
    setSubmitting(false)
    setScreen({ kind: 'ending', id: step.id })
  }

  const goBack = () => {
    if (screen.kind === 'ending') {
      const last = history[history.length - 1]
      if (last != null) {
        setDirection('back')
        setHistory((stack) => stack.slice(0, -1))
        setScreen({ kind: 'question', index: last })
      }
      return
    }
    if (screen.kind !== 'question') return
    const previous = history[history.length - 1]
    setDirection('back')
    setError(null)
    if (previous == null) {
      if (hasWelcome) setScreen({ kind: 'welcome' })
      return
    }
    setHistory((stack) => stack.slice(0, -1))
    setScreen({ kind: 'question', index: previous })
  }

  const uploadFile = useCallback(
    async (fieldId: string, file: File) => {
      if (preview) {
        // Nothing is stored in preview; fabricate a record so the UI can be seen.
        return { id: 'preview', name: file.name, size: file.size }
      }
      const id = await ensureResponse()
      if (!id) throw new Error('Could not start the response.')
      const { upload } = await api.uploadFile(id, fieldId, file)
      return upload
    },
    [ensureResponse, preview],
  )

  // Enter advances the welcome and ending screens too.
  useEffect(() => {
    if (screen.kind !== 'welcome') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') begin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const style = useMemo(() => themeStyle(form.theme), [form.theme])
  const ending = screen.kind === 'ending' ? form.endings.find((item) => item.id === screen.id) || form.endings[0] : undefined

  // A live form with a redirect ending sends the respondent onwards.
  useEffect(() => {
    if (preview || screen.kind !== 'ending' || !ending?.redirectUrl) return
    const timer = setTimeout(() => {
      window.location.href = ending.redirectUrl
    }, 1200)
    return () => clearTimeout(timer)
  }, [preview, screen, ending])

  const canGoBack =
    (screen.kind === 'question' && (history.length > 0 || hasWelcome)) ||
    (screen.kind === 'ending' && history.length > 0)

  return (
    <div className={classes('fill-root', embedded && 'embedded')} style={style}>
      {settings.showProgressBar && screen.kind === 'question' && (
        <div className="fill-progress" aria-hidden>
          <div className="fill-progress-bar" style={{ width: `${progressFor(form, screen.index) * 100}%` }} />
        </div>
      )}

      <div className="fill-stage">
        {screen.kind === 'welcome' && (
          <div className="fill-screen">
            <h1 className="fill-title">{form.welcome?.title || form.title}</h1>
            {form.welcome?.description && <p className="fill-description">{form.welcome.description}</p>}
            <div className="fill-actions" style={{ justifyContent: 'center' }}>
              <button className="fill-btn" onClick={begin} type="button">
                {form.welcome?.buttonText || 'Start'}
                <ArrowRight size={17} />
              </button>
              <span className="fill-hint">
                press <span className="fill-key">Enter</span> ↵
              </span>
            </div>
          </div>
        )}

        {screen.kind === 'question' &&
          (currentField ? (
            <QuestionView
              key={currentField.id}
              field={currentField}
              index={screen.index}
              total={form.fields.length}
              value={answers[currentField.id] ?? null}
              error={error}
              title={applyRecall(currentField.title, answers)}
              description={applyRecall(currentField.description, answers)}
              showNumber={settings.showQuestionNumbers}
              direction={direction}
              onChange={setAnswer}
              onNext={goNext}
              onUpload={(file) => uploadFile(currentField.id, file)}
            />
          ) : (
            <div className="fill-screen">
              <h1 className="fill-title">This form has no questions yet.</h1>
              <p className="fill-description">Add one in the builder and it will show up here.</p>
            </div>
          ))}

        {screen.kind === 'ending' && (
          <div className="fill-screen">
            <span className="fill-screen-mark">
              <PartyPopper size={26} />
            </span>
            <h1 className="fill-title">{ending?.title || 'Thank you!'}</h1>
            <p className="fill-description">{ending?.description || 'Your response has been recorded.'}</p>
            {ending?.buttonText && ending.buttonUrl && (
              <a className="fill-btn" href={ending.buttonUrl} target="_blank" rel="noreferrer">
                {ending.buttonText}
                <ArrowRight size={17} />
              </a>
            )}
            {ending?.redirectUrl && !preview && <p className="fill-hint">Taking you to {ending.redirectUrl}…</p>}
            {preview && <p className="fill-hint">Preview — nothing was saved.</p>}
          </div>
        )}

        {submitting && (
          <div className="fill-hint" style={{ marginTop: 14 }}>
            <Check size={13} /> Submitting…
          </div>
        )}
      </div>

      <footer className="fill-footer">
        <span className="fill-brand">{preview ? 'Preview' : 'Powered by FormFlow'}</span>
        {screen.kind !== 'welcome' && (
          <div className="fill-nav">
            <button onClick={goBack} disabled={!canGoBack} aria-label="Previous question" type="button">
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => goNext()}
              disabled={screen.kind !== 'question'}
              aria-label="Next question"
              type="button"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        )}
      </footer>
    </div>
  )
}
