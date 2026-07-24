import { GitBranch, Plus, Trash2 } from 'lucide-react'
import { CHOICE_TYPES, NUMERIC_TYPES } from '../../lib/fieldTypes'
import { operatorsFor, referenceableFields } from '../../lib/logic'
import type { Ending, Field, LogicRule } from '../../lib/types'
import { uid } from '../../lib/util'

interface LogicEditorProps {
  field: Field
  fields: Field[]
  endings: Ending[]
  onChange: (logic: LogicRule[]) => void
}

/**
 * Rules are evaluated top to bottom and the first match wins, so order is
 * meaningful — the UI numbers them and keeps "otherwise" explicit at the end.
 */
export function LogicEditor({ field, fields, endings, onChange }: LogicEditorProps) {
  const index = fields.findIndex((item) => item.id === field.id)
  const sources = referenceableFields(fields, field.id)
  const laterFields = fields.filter((_, i) => i !== index)

  const update = (ruleId: string, patch: Partial<LogicRule>) => {
    onChange(field.logic.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)))
  }

  const addRule = () => {
    const fallbackTarget = fields[index + 1]?.id || endings[0]?.id
    onChange([
      ...field.logic,
      {
        id: uid(8),
        fieldId: field.id,
        operator: 'is',
        value: '',
        targetType: fields[index + 1] ? 'field' : 'ending',
        targetId: fallbackTarget || '',
      },
    ])
  }

  return (
    <section className="inspector-section">
      <h3>Logic</h3>

      {field.logic.length === 0 && (
        <p className="muted tiny">
          By default this question leads to the next one. Add a rule to branch somewhere else based on the
          answer.
        </p>
      )}

      <div className="col" style={{ gap: 8 }}>
        {field.logic.map((rule, ruleIndex) => {
          const source = fields.find((item) => item.id === (rule.fieldId || field.id)) || field
          const operators = operatorsFor(source)
          const needsValue = !['is_empty', 'is_not_empty', 'always'].includes(rule.operator)

          return (
            <div key={rule.id} className="rule">
              <div className="row-between">
                <span className="rule-word">Rule {ruleIndex + 1}</span>
                <button
                  className="btn btn-ghost btn-icon"
                  title="Delete rule"
                  onClick={() => onChange(field.logic.filter((item) => item.id !== rule.id))}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="rule-line">
                <span className="rule-word">If</span>
                <select
                  className="select"
                  value={rule.fieldId || field.id}
                  onChange={(event) => update(rule.id, { fieldId: event.target.value })}
                >
                  {sources.map((item, i) => (
                    <option key={item.id} value={item.id}>
                      {i + 1}. {item.title || 'Untitled'}
                      {item.id === field.id ? ' (this question)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rule-line">
                <span className="rule-word" />
                <select
                  className="select"
                  value={rule.operator}
                  onChange={(event) => update(rule.id, { operator: event.target.value as LogicRule['operator'] })}
                >
                  {operators.map((operator) => (
                    <option key={operator.value} value={operator.value}>
                      {operator.label}
                    </option>
                  ))}
                </select>
              </div>

              {needsValue && (
                <div className="rule-line">
                  <span className="rule-word" />
                  <RuleValue source={source} rule={rule} onChange={(value) => update(rule.id, { value })} />
                </div>
              )}

              <div className="rule-line">
                <span className="rule-word">Then</span>
                <select
                  className="select"
                  value={`${rule.targetType}:${rule.targetId}`}
                  onChange={(event) => {
                    const [targetType, targetId] = event.target.value.split(':')
                    update(rule.id, { targetType: targetType as 'field' | 'ending', targetId })
                  }}
                >
                  <optgroup label="Jump to question">
                    {laterFields.map((item) => (
                      <option key={item.id} value={`field:${item.id}`}>
                        {fields.indexOf(item) + 1}. {item.title || 'Untitled'}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Finish on">
                    {endings.map((ending, i) => (
                      <option key={ending.id} value={`ending:${ending.id}`}>
                        {ending.title || `Ending ${i + 1}`}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          )
        })}
      </div>

      <button className="btn btn-block" onClick={addRule}>
        <Plus size={15} />
        Add rule
      </button>

      {field.logic.length > 0 && (
        <p className="muted tiny">
          <GitBranch size={12} style={{ verticalAlign: -2 }} /> Rules are checked in order; the first match
          wins. If none match, the form continues to question {index + 2 <= fields.length ? index + 2 : 'the ending'}.
        </p>
      )}
    </section>
  )
}

function RuleValue({
  source,
  rule,
  onChange,
}: {
  source: Field
  rule: LogicRule
  onChange: (value: string | number) => void
}) {
  if (CHOICE_TYPES.includes(source.type)) {
    return (
      <select className="select" value={String(rule.value ?? '')} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose an option…</option>
        {(source.properties.choices || []).map((choice) => (
          <option key={choice.id} value={choice.label}>
            {choice.label}
          </option>
        ))}
      </select>
    )
  }

  if (source.type === 'yes_no') {
    return (
      <select className="select" value={String(rule.value ?? '')} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    )
  }

  if (NUMERIC_TYPES.includes(source.type)) {
    return (
      <input
        className="input"
        type="number"
        value={String(rule.value ?? '')}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
        placeholder="Value"
      />
    )
  }

  return (
    <input
      className="input"
      value={String(rule.value ?? '')}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Value"
    />
  )
}
