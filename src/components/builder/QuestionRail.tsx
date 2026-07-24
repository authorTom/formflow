import { useState } from 'react'
import { Copy, Flag, GripVertical, Home, Plus, Trash2 } from 'lucide-react'
import { FIELD_GROUPS, FIELD_META, createField } from '../../lib/fieldTypes'
import { describeRecall } from '../../lib/recall'
import type { Ending, Field, FieldType } from '../../lib/types'
import { classes, uid } from '../../lib/util'
import { Modal } from '../Modal'

export type Selection =
  | { kind: 'welcome' }
  | { kind: 'field'; id: string }
  | { kind: 'ending'; id: string }

interface RailProps {
  fields: Field[]
  endings: Ending[]
  selection: Selection
  welcomeEnabled: boolean
  onSelect: (selection: Selection) => void
  onFieldsChange: (fields: Field[]) => void
  onEndingsChange: (endings: Ending[]) => void
}

export function QuestionRail({
  fields,
  endings,
  selection,
  welcomeEnabled,
  onSelect,
  onFieldsChange,
  onEndingsChange,
}: RailProps) {
  const [picking, setPicking] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const addField = (type: FieldType) => {
    const field = createField(type)
    onFieldsChange([...fields, field])
    onSelect({ kind: 'field', id: field.id })
    setPicking(false)
  }

  const duplicateField = (index: number) => {
    const copy: Field = {
      ...fields[index],
      id: uid(),
      // Logic targets are ids on *other* fields, so they survive the copy; the
      // rule ids themselves must not be shared.
      logic: fields[index].logic.map((rule) => ({ ...rule, id: uid(8) })),
    }
    const next = [...fields]
    next.splice(index + 1, 0, copy)
    onFieldsChange(next)
    onSelect({ kind: 'field', id: copy.id })
  }

  const removeField = (index: number) => {
    const removed = fields[index]
    const next = fields.filter((_, i) => i !== index)
    onFieldsChange(next)
    if (selection.kind === 'field' && selection.id === removed.id) {
      const fallback = next[Math.min(index, next.length - 1)]
      onSelect(fallback ? { kind: 'field', id: fallback.id } : { kind: 'welcome' })
    }
  }

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const next = [...fields]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onFieldsChange(next)
  }

  const addEnding = () => {
    const ending: Ending = {
      id: uid(),
      title: 'Thanks for your time!',
      description: '',
      buttonText: '',
      buttonUrl: '',
      redirectUrl: '',
    }
    onEndingsChange([...endings, ending])
    onSelect({ kind: 'ending', id: ending.id })
  }

  return (
    <aside className="builder-rail">
      <div className="rail-head">
        <span>Content</span>
        <span className="tiny" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {fields.length}
        </span>
      </div>

      <div className="rail-body">
        <button
          className={classes('q-item', selection.kind === 'welcome' && 'selected')}
          onClick={() => onSelect({ kind: 'welcome' })}
          style={{ cursor: 'pointer' }}
        >
          <span className="q-index">
            <Home size={12} />
          </span>
          <span className="q-text">Welcome screen</span>
          {!welcomeEnabled && <span className="tiny faint">off</span>}
        </button>

        {fields.map((field, index) => {
          const Icon = FIELD_META[field.type]?.icon ?? Home
          const isSelected = selection.kind === 'field' && selection.id === field.id

          return (
            <div
              key={field.id}
              className={classes(
                'q-item',
                isSelected && 'selected',
                dragIndex === index && 'dragging',
                overIndex === index && dragIndex !== index && 'drag-over',
              )}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setOverIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex != null) reorder(dragIndex, index)
                setDragIndex(null)
                setOverIndex(null)
              }}
              onClick={() => onSelect({ kind: 'field', id: field.id })}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect({ kind: 'field', id: field.id })
                }
                // Alt+arrows reorder without a mouse.
                if (event.altKey && event.key === 'ArrowUp' && index > 0) reorder(index, index - 1)
                if (event.altKey && event.key === 'ArrowDown' && index < fields.length - 1) reorder(index, index + 1)
              }}
            >
              <span className="q-index">{index + 1}</span>
              <Icon size={14} className="faint" style={{ flex: 'none' }} />
              <span className="q-text">
                {describeRecall(field.title, fields) || FIELD_META[field.type]?.label || 'Question'}
              </span>
              <span className="q-meta">
                {field.logic.length > 0 && (
                  <span className="tiny badge badge-accent" title={`${field.logic.length} logic rule(s)`}>
                    {field.logic.length}
                  </span>
                )}
                {isSelected && (
                  <>
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Duplicate"
                      onClick={(event) => {
                        event.stopPropagation()
                        duplicateField(index)
                      }}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Delete"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeField(index)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
                {!isSelected && <GripVertical size={13} />}
              </span>
            </div>
          )
        })}

        <div className="rail-head" style={{ border: 0, padding: '14px 4px 6px' }}>
          <span>Endings</span>
          <button className="btn btn-ghost btn-icon" onClick={addEnding} title="Add ending">
            <Plus size={14} />
          </button>
        </div>

        {endings.map((ending, index) => {
          const isSelected = selection.kind === 'ending' && selection.id === ending.id
          return (
            <div
              key={ending.id}
              className={classes('q-item', isSelected && 'selected')}
              onClick={() => onSelect({ kind: 'ending', id: ending.id })}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              onKeyDown={(event) => event.key === 'Enter' && onSelect({ kind: 'ending', id: ending.id })}
            >
              <span className="q-index">
                <Flag size={11} />
              </span>
              <span className="q-text">{ending.title || `Ending ${index + 1}`}</span>
              {isSelected && endings.length > 1 && (
                <button
                  className="btn btn-ghost btn-icon"
                  title="Delete ending"
                  onClick={(event) => {
                    event.stopPropagation()
                    const next = endings.filter((item) => item.id !== ending.id)
                    onEndingsChange(next)
                    onSelect({ kind: 'ending', id: next[0].id })
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="rail-foot">
        <button className="btn btn-primary btn-block" onClick={() => setPicking(true)}>
          <Plus size={16} />
          Add question
        </button>
      </div>

      {picking && <TypePicker onPick={addField} onClose={() => setPicking(false)} />}
    </aside>
  )
}

function TypePicker({ onPick, onClose }: { onPick: (type: FieldType) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()

  return (
    <Modal title="Add a question" onClose={onClose} wide>
      <input
        className="input"
        placeholder="Search question types…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
        style={{ marginBottom: 14 }}
      />

      <div className="col" style={{ gap: 16 }}>
        {FIELD_GROUPS.map((group) => {
          const entries = (Object.entries(FIELD_META) as [FieldType, (typeof FIELD_META)[FieldType]][]).filter(
            ([, meta]) =>
              meta.group === group &&
              (!needle || meta.label.toLowerCase().includes(needle) || meta.hint.toLowerCase().includes(needle)),
          )
          if (!entries.length) return null

          return (
            <section key={group} className="inspector-section">
              <h3>{group}</h3>
              <div className="type-grid">
                {entries.map(([type, meta]) => (
                  <button key={type} className="type-option" onClick={() => onPick(type)}>
                    <span className="type-icon">
                      <meta.icon size={16} />
                    </span>
                    <span className="grow">
                      <b style={{ fontSize: '0.88rem' }}>{meta.label}</b>
                      <span className="muted tiny" style={{ display: 'block' }}>
                        {meta.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
