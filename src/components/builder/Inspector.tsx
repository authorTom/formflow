import { AtSign, Plus, Trash2 } from 'lucide-react'
import { FIELD_META } from '../../lib/fieldTypes'
import { recallToken } from '../../lib/recall'
import type { Choice, Ending, Field, FieldType, FormDoc, Welcome } from '../../lib/types'
import { uid } from '../../lib/util'
import { LogicEditor } from './LogicEditor'
import type { Selection } from './QuestionRail'

interface InspectorProps {
  doc: FormDoc
  selection: Selection
  onFieldChange: (field: Field) => void
  onEndingChange: (ending: Ending) => void
  onWelcomeChange: (welcome: Welcome) => void
  onFieldsChange: (fields: Field[]) => void
}

export function Inspector({
  doc,
  selection,
  onFieldChange,
  onEndingChange,
  onWelcomeChange,
  onFieldsChange,
}: InspectorProps) {
  if (selection.kind === 'welcome') {
    return <WelcomeInspector welcome={doc.welcome} onChange={onWelcomeChange} />
  }

  if (selection.kind === 'ending') {
    const ending = doc.endings.find((item) => item.id === selection.id)
    if (!ending) return <EmptyInspector />
    return <EndingInspector ending={ending} onChange={onEndingChange} />
  }

  const field = doc.fields.find((item) => item.id === selection.id)
  if (!field) return <EmptyInspector />

  return (
    <FieldInspector
      field={field}
      doc={doc}
      onChange={onFieldChange}
      onLogicChange={(logic) => onFieldChange({ ...field, logic })}
      onFieldsChange={onFieldsChange}
    />
  )
}

function EmptyInspector() {
  return (
    <aside className="builder-inspector">
      <div className="rail-head">Settings</div>
      <div className="inspector-body">
        <p className="muted small">Select something on the left to edit it.</p>
      </div>
    </aside>
  )
}

function WelcomeInspector({ welcome, onChange }: { welcome: Welcome; onChange: (welcome: Welcome) => void }) {
  return (
    <aside className="builder-inspector">
      <div className="rail-head">Welcome screen</div>
      <div className="inspector-body">
        <label className="switch">
          <input
            type="checkbox"
            checked={!!welcome.enabled}
            onChange={(event) => onChange({ ...welcome, enabled: event.target.checked })}
          />
          <span className="switch-track" />
          Show a welcome screen
        </label>

        <section className="inspector-section">
          <h3>Content</h3>
          <div>
            <label className="field-label">Title</label>
            <textarea
              className="textarea"
              rows={2}
              value={welcome.title || ''}
              onChange={(event) => onChange({ ...welcome, title: event.target.value })}
              placeholder="Tell us what you think"
            />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="textarea"
              rows={3}
              value={welcome.description || ''}
              onChange={(event) => onChange({ ...welcome, description: event.target.value })}
              placeholder="Takes about two minutes."
            />
          </div>
          <div>
            <label className="field-label">Button text</label>
            <input
              className="input"
              value={welcome.buttonText || ''}
              onChange={(event) => onChange({ ...welcome, buttonText: event.target.value })}
              placeholder="Start"
            />
          </div>
        </section>
      </div>
    </aside>
  )
}

function EndingInspector({ ending, onChange }: { ending: Ending; onChange: (ending: Ending) => void }) {
  return (
    <aside className="builder-inspector">
      <div className="rail-head">Ending screen</div>
      <div className="inspector-body">
        <section className="inspector-section">
          <h3>Content</h3>
          <div>
            <label className="field-label">Title</label>
            <textarea
              className="textarea"
              rows={2}
              value={ending.title}
              onChange={(event) => onChange({ ...ending, title: event.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="textarea"
              rows={3}
              value={ending.description}
              onChange={(event) => onChange({ ...ending, description: event.target.value })}
            />
          </div>
        </section>

        <section className="inspector-section">
          <h3>Call to action</h3>
          <div>
            <label className="field-label">Button text</label>
            <input
              className="input"
              value={ending.buttonText}
              onChange={(event) => onChange({ ...ending, buttonText: event.target.value })}
              placeholder="Visit our site"
            />
          </div>
          <div>
            <label className="field-label">Button link</label>
            <input
              className="input"
              value={ending.buttonUrl}
              onChange={(event) => onChange({ ...ending, buttonUrl: event.target.value })}
              placeholder="https://example.com"
            />
          </div>
        </section>

        <section className="inspector-section">
          <h3>Redirect</h3>
          <input
            className="input"
            value={ending.redirectUrl}
            onChange={(event) => onChange({ ...ending, redirectUrl: event.target.value })}
            placeholder="https://example.com/thanks"
          />
          <p className="field-hint">
            If set, respondents are sent here automatically a moment after finishing.
          </p>
        </section>
      </div>
    </aside>
  )
}

interface FieldInspectorProps {
  field: Field
  doc: FormDoc
  onChange: (field: Field) => void
  onLogicChange: (logic: Field['logic']) => void
  onFieldsChange: (fields: Field[]) => void
}

function FieldInspector({ field, doc, onChange, onLogicChange }: FieldInspectorProps) {
  const meta = FIELD_META[field.type]
  const index = doc.fields.findIndex((item) => item.id === field.id)
  const earlier = doc.fields.slice(0, index)

  const setProperty = <K extends keyof Field['properties']>(key: K, value: Field['properties'][K]) => {
    onChange({ ...field, properties: { ...field.properties, [key]: value } })
  }

  const changeType = (type: FieldType) => {
    // Keep the wording, reset the settings — a rating's "steps" means nothing to
    // a dropdown, and stale properties render as broken controls.
    const defaults = FIELD_META[type].defaults()
    onChange({ ...field, type, properties: defaults.properties })
  }

  return (
    <aside className="builder-inspector">
      <div className="rail-head">
        <span>Question {index + 1}</span>
        <span className="tiny" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {meta?.label}
        </span>
      </div>

      <div className="inspector-body">
        <section className="inspector-section">
          <h3>Question</h3>
          <div>
            <div className="row-between" style={{ marginBottom: 5 }}>
              <label className="field-label" style={{ margin: 0 }}>
                Title
              </label>
              {earlier.length > 0 && (
                <RecallMenu
                  fields={earlier}
                  onPick={(id) => onChange({ ...field, title: `${field.title} ${recallToken(id)}`.trim() })}
                />
              )}
            </div>
            <textarea
              className="textarea"
              rows={2}
              value={field.title}
              onChange={(event) => onChange({ ...field, title: event.target.value })}
              placeholder="Your question"
            />
          </div>

          <div>
            <label className="field-label">Description</label>
            <textarea
              className="textarea"
              rows={2}
              value={field.description}
              onChange={(event) => onChange({ ...field, description: event.target.value })}
              placeholder="Optional help text"
            />
          </div>

          <div>
            <label className="field-label">Type</label>
            <select className="select" value={field.type} onChange={(event) => changeType(event.target.value as FieldType)}>
              {(Object.keys(FIELD_META) as FieldType[]).map((type) => (
                <option key={type} value={type}>
                  {FIELD_META[type].label}
                </option>
              ))}
            </select>
          </div>

          {field.type !== 'statement' && (
            <label className="switch">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) => onChange({ ...field, required: event.target.checked })}
              />
              <span className="switch-track" />
              Required
            </label>
          )}
        </section>

        <FieldSettings field={field} setProperty={setProperty} onChange={onChange} />

        {field.type !== 'statement' && (
          <LogicEditor field={field} fields={doc.fields} endings={doc.endings} onChange={onLogicChange} />
        )}
      </div>
    </aside>
  )
}

function RecallMenu({ fields, onPick }: { fields: Field[]; onPick: (id: string) => void }) {
  return (
    <select
      className="select"
      style={{ width: 'auto', padding: '3px 24px 3px 7px', fontSize: '0.75rem' }}
      value=""
      onChange={(event) => event.target.value && onPick(event.target.value)}
      title="Insert an earlier answer into this question"
    >
      <option value="">＠ Recall…</option>
      {fields.map((item, index) => (
        <option key={item.id} value={item.id}>
          {index + 1}. {item.title || 'Untitled'}
        </option>
      ))}
    </select>
  )
}

interface SettingsProps {
  field: Field
  setProperty: <K extends keyof Field['properties']>(key: K, value: Field['properties'][K]) => void
  onChange: (field: Field) => void
}

function FieldSettings({ field, setProperty }: SettingsProps) {
  const { properties } = field

  switch (field.type) {
    case 'multiple_choice':
    case 'dropdown':
      return (
        <section className="inspector-section">
          <h3>Options</h3>
          <ChoiceList
            choices={properties.choices || []}
            onChange={(choices) => setProperty('choices', choices)}
          />
          {field.type === 'multiple_choice' && (
            <>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!properties.allowMultiple}
                  onChange={(event) => setProperty('allowMultiple', event.target.checked)}
                />
                <span className="switch-track" />
                Allow multiple selections
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!properties.randomize}
                  onChange={(event) => setProperty('randomize', event.target.checked)}
                />
                <span className="switch-track" />
                Randomise the order
              </label>
            </>
          )}
        </section>
      )

    case 'rating':
      return (
        <section className="inspector-section">
          <h3>Scale</h3>
          <div>
            <label className="field-label">Steps</label>
            <input
              className="input"
              type="number"
              min={3}
              max={10}
              value={properties.steps ?? 5}
              onChange={(event) => setProperty('steps', Number(event.target.value))}
            />
          </div>
          <div>
            <label className="field-label">Icon</label>
            <select
              className="select"
              value={properties.shape ?? 'star'}
              onChange={(event) => setProperty('shape', event.target.value as 'star' | 'heart' | 'thumb')}
            >
              <option value="star">Stars</option>
              <option value="heart">Hearts</option>
              <option value="thumb">Thumbs</option>
            </select>
          </div>
        </section>
      )

    case 'opinion_scale':
      return (
        <section className="inspector-section">
          <h3>Scale</h3>
          <div>
            <label className="field-label">Steps</label>
            <input
              className="input"
              type="number"
              min={2}
              max={11}
              value={properties.steps ?? 11}
              onChange={(event) => setProperty('steps', Number(event.target.value))}
            />
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={!!properties.startAtOne}
              onChange={(event) => setProperty('startAtOne', event.target.checked)}
            />
            <span className="switch-track" />
            Start at 1 instead of 0
          </label>
          <div>
            <label className="field-label">Left label</label>
            <input
              className="input"
              value={properties.labels?.left ?? ''}
              onChange={(event) => setProperty('labels', { ...properties.labels, left: event.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Right label</label>
            <input
              className="input"
              value={properties.labels?.right ?? ''}
              onChange={(event) => setProperty('labels', { ...properties.labels, right: event.target.value })}
            />
          </div>
        </section>
      )

    case 'number':
      return (
        <section className="inspector-section">
          <h3>Range</h3>
          <div className="row">
            <div className="grow">
              <label className="field-label">Minimum</label>
              <input
                className="input"
                type="number"
                value={properties.min ?? ''}
                onChange={(event) => setProperty('min', event.target.value === '' ? undefined : Number(event.target.value))}
              />
            </div>
            <div className="grow">
              <label className="field-label">Maximum</label>
              <input
                className="input"
                type="number"
                value={properties.max ?? ''}
                onChange={(event) => setProperty('max', event.target.value === '' ? undefined : Number(event.target.value))}
              />
            </div>
          </div>
        </section>
      )

    case 'short_text':
    case 'long_text':
      return (
        <section className="inspector-section">
          <h3>Input</h3>
          <div>
            <label className="field-label">Placeholder</label>
            <input
              className="input"
              value={properties.placeholder ?? ''}
              onChange={(event) => setProperty('placeholder', event.target.value)}
              placeholder="Type your answer…"
            />
          </div>
          <div>
            <label className="field-label">Character limit</label>
            <input
              className="input"
              type="number"
              min={1}
              value={properties.maxLength ?? ''}
              onChange={(event) =>
                setProperty('maxLength', event.target.value === '' ? undefined : Number(event.target.value))
              }
            />
          </div>
        </section>
      )

    case 'email':
    case 'phone':
    case 'url':
      return (
        <section className="inspector-section">
          <h3>Input</h3>
          <div>
            <label className="field-label">Placeholder</label>
            <input
              className="input"
              value={properties.placeholder ?? ''}
              onChange={(event) => setProperty('placeholder', event.target.value)}
            />
          </div>
        </section>
      )

    case 'file_upload':
      return (
        <section className="inspector-section">
          <h3>Uploads</h3>
          <div>
            <label className="field-label">Accepted types</label>
            <input
              className="input"
              value={properties.accept ?? ''}
              onChange={(event) => setProperty('accept', event.target.value)}
              placeholder="image/*,.pdf"
            />
            <p className="field-hint">
              A comma-separated list of MIME types or extensions. Leave blank to accept anything. Size limits are
              set by the server.
            </p>
          </div>
        </section>
      )

    case 'statement':
      return (
        <section className="inspector-section">
          <h3>Button</h3>
          <input
            className="input"
            value={properties.buttonText ?? ''}
            onChange={(event) => setProperty('buttonText', event.target.value)}
            placeholder="Continue"
          />
        </section>
      )

    default:
      return null
  }
}

function ChoiceList({ choices, onChange }: { choices: Choice[]; onChange: (choices: Choice[]) => void }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      {choices.map((choice, index) => (
        <div key={choice.id} className="choice-row">
          <input
            className="input"
            value={choice.label}
            onChange={(event) =>
              onChange(choices.map((item) => (item.id === choice.id ? { ...item, label: event.target.value } : item)))
            }
            placeholder={`Option ${index + 1}`}
          />
          <button
            className="btn btn-ghost btn-icon"
            title="Remove option"
            disabled={choices.length <= 1}
            onClick={() => onChange(choices.filter((item) => item.id !== choice.id))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="btn btn-sm"
        onClick={() => onChange([...choices, { id: uid(8), label: `Option ${choices.length + 1}` }])}
      >
        <Plus size={14} />
        Add option
      </button>
      <p className="field-hint">
        <AtSign size={11} style={{ verticalAlign: -1 }} /> Option labels are what gets stored and exported.
      </p>
    </div>
  )
}
