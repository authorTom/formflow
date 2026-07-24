import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CornerDownLeft,
  Heart,
  Paperclip,
  Star,
  ThumbsUp,
  Upload,
  X,
} from 'lucide-react'
import type { AnswerValue, Field } from '../lib/types'
import { classes, formatBytes } from '../lib/util'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const RATING_ICONS = { star: Star, heart: Heart, thumb: ThumbsUp }

export interface QuestionViewProps {
  field: Field
  index: number
  total: number
  value: AnswerValue
  error: string | null
  /** Title and description with recall tokens already substituted. */
  title: string
  description: string
  showNumber: boolean
  direction: 'forward' | 'back'
  onChange: (value: AnswerValue) => void
  /**
   * Advance. Inputs that select-and-advance in one gesture must pass the chosen
   * value: they fire from a timeout whose closure predates the state update, so
   * the runner would otherwise read the previous (empty) answer.
   */
  onNext: (value?: AnswerValue) => void
  onUpload: (file: File) => Promise<{ id: string; name: string; size: number }>
}

export function QuestionView(props: QuestionViewProps) {
  const { field, index, total, error, title, description, showNumber, direction, onNext } = props
  const isStatement = field.type === 'statement'
  const multiSelect = field.type === 'multiple_choice' && !!field.properties.allowMultiple

  return (
    <div className={classes('fill-card', direction === 'back' ? 'enter-back' : 'enter-forward')}>
      {showNumber && !isStatement && (
        <span className="fill-number">
          {index + 1}
          <ArrowRight size={13} />
          <span className="fill-hint" style={{ marginLeft: 2 }}>
            of {total}
          </span>
        </span>
      )}

      <div>
        <h1 className="fill-title">
          {title || 'Untitled question'}
          {field.required && !isStatement && (
            <span className="fill-required" title="Required">
              *
            </span>
          )}
        </h1>
        {description && (
          <p className="fill-description" style={{ marginTop: 10 }}>
            {description}
          </p>
        )}
      </div>

      <AnswerInput {...props} />

      {error && (
        <p className="fill-error">
          <AlertCircle size={15} />
          {error}
        </p>
      )}

      {/* Single-select choices submit themselves, so they need no OK button. */}
      {needsSubmitButton(field, multiSelect) && (
        <div className="fill-actions">
          <button className="fill-btn" onClick={() => onNext()} type="button">
            {isStatement ? field.properties.buttonText || 'Continue' : 'OK'}
            {!isStatement && <Check size={17} />}
          </button>
          {!isStatement && (
            <span className="fill-hint">
              press <span className="fill-key">Enter</span>
              {field.type === 'long_text' ? (
                <>
                  {' '}
                  with <span className="fill-key">⌘</span>
                </>
              ) : (
                ' ↵'
              )}
            </span>
          )}
        </div>
      )}

      {/* Multi-select and free-text-ish inputs keep a persistent OK; single
          choices show a subtle hint instead so the screen stays quiet. */}
      {!needsSubmitButton(field, multiSelect) && !isStatement && (
        <span className="fill-hint">
          <CornerDownLeft size={12} style={{ verticalAlign: -2 }} /> Choose an option to continue
        </span>
      )}
    </div>
  )
}

function needsSubmitButton(field: Field, multiSelect: boolean) {
  if (field.type === 'statement') return true
  if (field.type === 'yes_no') return false
  if (field.type === 'multiple_choice') return multiSelect
  if (field.type === 'rating' || field.type === 'opinion_scale') return false
  return true
}

function AnswerInput({ field, value, onChange, onNext, onUpload }: QuestionViewProps) {
  const { properties } = field

  switch (field.type) {
    case 'long_text':
      return <LongText field={field} value={value} onChange={onChange} onNext={onNext} />

    case 'multiple_choice':
      return <ChoiceInput field={field} value={value} onChange={onChange} onNext={onNext} />

    case 'yes_no':
      return <YesNo value={value} onChange={onChange} onNext={onNext} />

    case 'dropdown':
      return (
        <select
          className="fill-select"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          autoFocus
        >
          <option value="">Choose an option…</option>
          {(properties.choices || []).map((choice) => (
            <option key={choice.id} value={choice.label}>
              {choice.label}
            </option>
          ))}
        </select>
      )

    case 'rating':
      return <Rating field={field} value={value} onChange={onChange} onNext={onNext} />

    case 'opinion_scale':
      return <OpinionScale field={field} value={value} onChange={onChange} onNext={onNext} />

    case 'file_upload':
      return <FileInput value={value} onChange={onChange} onUpload={onUpload} accept={properties.accept} />

    case 'statement':
      return null

    default:
      return <TextInput field={field} value={value} onChange={onChange} onNext={onNext} />
  }
}

/** Enter submits everywhere except the paragraph box, where it inserts a line. */
function submitOnEnter(onNext: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onNext()
    }
  }
}

interface InputProps {
  field: Field
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  onNext: (value?: AnswerValue) => void
}

function TextInput({ field, value, onChange, onNext }: InputProps) {
  const inputType =
    field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text'

  return (
    <input
      className="fill-input"
      type={inputType}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      placeholder={field.properties.placeholder || 'Type your answer…'}
      value={value == null ? '' : String(value)}
      min={field.properties.min}
      max={field.properties.max}
      maxLength={field.properties.maxLength}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      onKeyDown={submitOnEnter(onNext)}
      autoFocus
      autoComplete="off"
    />
  )
}

function LongText({ field, value, onChange, onNext }: InputProps) {
  const text = value == null ? '' : String(value)
  const max = field.properties.maxLength

  return (
    <div>
      <textarea
        className="fill-input"
        rows={4}
        placeholder={field.properties.placeholder || 'Type your answer…'}
        value={text}
        maxLength={max}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        onKeyDown={(event) => {
          // Enter is a newline here; ⌘/Ctrl+Enter is "done".
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onNext()
          }
        }}
        autoFocus
      />
      {max != null && (
        <div className="fill-counter">
          {text.length} / {max}
        </div>
      )}
    </div>
  )
}

function ChoiceInput({ field, value, onChange, onNext }: InputProps) {
  const multi = !!field.properties.allowMultiple
  const choices = field.properties.choices || []
  const selected = Array.isArray(value) ? value : value == null ? [] : [String(value)]

  // Randomised order is computed once per mount so re-renders do not reshuffle
  // the list under the respondent's cursor.
  const order = useRef(
    field.properties.randomize ? [...choices].sort(() => Math.random() - 0.5) : choices,
  ).current

  const pick = (label: string) => {
    if (multi) {
      onChange(selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label])
      return
    }
    onChange(label)
    // Brief pause so the selected state is visible before the slide. The value
    // is passed explicitly because this closure predates the state update.
    setTimeout(() => onNext(label), 180)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const index = LETTERS.indexOf(event.key.toUpperCase())
      if (index >= 0 && index < order.length) {
        event.preventDefault()
        pick(order[index].label)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fill-choices">
      {order.map((choice, index) => {
        const isOn = selected.includes(choice.label)
        return (
          <button
            key={choice.id}
            type="button"
            className={classes('fill-choice', isOn && 'selected')}
            onClick={() => pick(choice.label)}
            aria-pressed={isOn}
          >
            <span className="fill-choice-key">{LETTERS[index] || '·'}</span>
            <span className="grow">{choice.label}</span>
            {isOn && <Check size={17} className="fill-choice-check" />}
          </button>
        )
      })}
    </div>
  )
}

function YesNo({ value, onChange, onNext }: Omit<InputProps, 'field'>) {
  const pick = (answer: boolean) => {
    onChange(answer)
    setTimeout(() => onNext(answer), 180)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key.toLowerCase() === 'y') pick(true)
      if (event.key.toLowerCase() === 'n') pick(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fill-yesno">
      {[
        { label: 'Yes', key: 'Y', answer: true },
        { label: 'No', key: 'N', answer: false },
      ].map((option) => (
        <button
          key={option.key}
          type="button"
          className={classes('fill-choice', value === option.answer && 'selected')}
          onClick={() => pick(option.answer)}
          aria-pressed={value === option.answer}
        >
          <span className="fill-choice-key">{option.key}</span>
          <span className="grow">{option.label}</span>
          {value === option.answer && <Check size={17} className="fill-choice-check" />}
        </button>
      ))}
    </div>
  )
}

function Rating({ field, value, onChange, onNext }: InputProps) {
  const steps = Math.min(10, Math.max(3, field.properties.steps ?? 5))
  const Icon = RATING_ICONS[field.properties.shape ?? 'star']
  const current = typeof value === 'number' ? value : 0
  const [hover, setHover] = useState(0)
  const active = hover || current

  return (
    <div className="fill-rating" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: steps }, (_, index) => index + 1).map((step) => (
        <button
          key={step}
          type="button"
          className={classes('fill-star', step <= active && 'on')}
          onMouseEnter={() => setHover(step)}
          onClick={() => {
            onChange(step)
            setTimeout(() => onNext(step), 200)
          }}
          aria-label={`${step} of ${steps}`}
          aria-pressed={current === step}
        >
          <Icon size={30} fill={step <= active ? 'currentColor' : 'none'} strokeWidth={1.6} />
        </button>
      ))}
    </div>
  )
}

function OpinionScale({ field, value, onChange, onNext }: InputProps) {
  const steps = Math.min(11, Math.max(2, field.properties.steps ?? 11))
  const start = field.properties.startAtOne ? 1 : 0
  const labels = field.properties.labels || {}
  const numbers = Array.from({ length: steps }, (_, index) => start + index)

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="fill-scale">
        {numbers.map((number) => (
          <button
            key={number}
            type="button"
            className={classes('fill-scale-step', value === number && 'on')}
            onClick={() => {
              onChange(number)
              setTimeout(() => onNext(number), 200)
            }}
            aria-pressed={value === number}
          >
            {number}
          </button>
        ))}
      </div>
      {(labels.left || labels.right) && (
        <div className="fill-scale-labels">
          <span>{labels.left}</span>
          <span>{labels.right}</span>
        </div>
      )}
    </div>
  )
}

interface FileInputProps {
  value: AnswerValue
  accept?: string
  onChange: (value: AnswerValue) => void
  onUpload: (file: File) => Promise<{ id: string; name: string; size: number }>
}

function FileInput({ value, accept, onChange, onUpload }: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [failure, setFailure] = useState('')
  const attached = value && typeof value === 'object' && !Array.isArray(value) ? value : null

  const send = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setFailure('')
    try {
      const upload = await onUpload(file)
      onChange({ uploadId: upload.id, name: upload.name, size: upload.size })
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  if (attached) {
    return (
      <div className="fill-file">
        <Paperclip size={18} />
        <span className="grow">
          <b>{attached.name}</b>
          <span className="fill-hint" style={{ display: 'block' }}>
            {formatBytes(attached.size)}
          </span>
        </span>
        <button
          type="button"
          className="fill-btn fill-btn-quiet"
          onClick={() => onChange(null)}
          aria-label="Remove file"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div
        className={classes('fill-drop', over && 'over')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          send(event.dataTransfer.files[0])
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
      >
        {busy ? (
          <>
            <div className="spinner" />
            <span>Uploading…</span>
          </>
        ) : (
          <>
            <Upload size={22} />
            <span>
              <b>Choose a file</b> or drag it here
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept || undefined}
          hidden
          onChange={(event) => send(event.target.files?.[0])}
        />
      </div>
      {failure && (
        <p className="fill-error" style={{ marginTop: 8 }}>
          <AlertCircle size={15} />
          {failure}
        </p>
      )}
    </div>
  )
}
