// Conditional logic. Each field carries an ordered list of rules; the first one
// that matches decides where the respondent goes next. With no matching rule the
// form simply advances to the following field, and running past the last field
// lands on the first ending.

import type { AnswerMap, AnswerValue, Field, LogicOperator, LogicRule, PublicForm } from './types'
import { NON_INPUT_TYPES } from './fieldTypes'

export type Step = { kind: 'field'; index: number } | { kind: 'ending'; id: string | null }

/** Flatten an answer for comparison. Arrays keep their items for `contains`. */
function comparable(value: AnswerValue): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'boolean') return [value ? 'yes' : 'no']
  if (typeof value === 'object') return [value.name]
  return [String(value)]
}

function asNumber(value: AnswerValue): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

export function evaluateRule(rule: LogicRule, ownFieldId: string, answers: AnswerMap): boolean {
  if (rule.operator === 'always') return true

  const answer = answers[rule.fieldId || ownFieldId] ?? null
  const items = comparable(answer)
  const target = rule.value == null ? '' : String(rule.value)
  const lower = items.map((item) => item.toLowerCase())
  const targetLower = target.toLowerCase()

  const ops: Record<LogicOperator, () => boolean> = {
    always: () => true,
    is: () => lower.includes(targetLower),
    is_not: () => !lower.includes(targetLower),
    contains: () => lower.some((item) => item.includes(targetLower)),
    not_contains: () => !lower.some((item) => item.includes(targetLower)),
    gt: () => {
      const n = asNumber(answer)
      return n != null && n > Number(target)
    },
    lt: () => {
      const n = asNumber(answer)
      return n != null && n < Number(target)
    },
    is_empty: () => items.length === 0 || items.every((item) => item === ''),
    is_not_empty: () => items.length > 0 && items.some((item) => item !== ''),
  }

  return ops[rule.operator]?.() ?? false
}

/**
 * Where does the respondent go after finishing the field at `fromIndex`?
 * Jump targets that no longer exist are ignored, so deleting a field cannot
 * strand a form mid-flow.
 */
export function nextStep(form: PublicForm, fromIndex: number, answers: AnswerMap): Step {
  const field = form.fields[fromIndex]
  const firstEnding = form.endings[0]?.id ?? null

  if (field) {
    for (const rule of field.logic || []) {
      if (!evaluateRule(rule, field.id, answers)) continue

      if (rule.targetType === 'ending') {
        const ending = form.endings.find((e) => e.id === rule.targetId)
        if (ending) return { kind: 'ending', id: ending.id }
        continue
      }
      const index = form.fields.findIndex((f) => f.id === rule.targetId)
      if (index >= 0) return { kind: 'field', index }
    }
  }

  const next = fromIndex + 1
  return next < form.fields.length ? { kind: 'field', index: next } : { kind: 'ending', id: firstEnding }
}

/** True when the field needs an answer before the respondent can continue. */
export function requiresAnswer(field: Field) {
  return field.required && !NON_INPUT_TYPES.includes(field.type)
}

/**
 * Best-effort progress for the progress bar. Logic jumps make the real path
 * length unknowable up front, so this reports how far through the field list
 * the current question sits — monotonic in the common (no-jump) case and never
 * misleadingly stuck at 0%.
 */
export function progressFor(form: PublicForm, currentIndex: number) {
  if (!form.fields.length) return 1
  return Math.min(1, (currentIndex + 1) / form.fields.length)
}

/**
 * Which fields a rule may reference: itself and anything before it. Referring
 * forwards would test an answer that does not exist yet.
 */
export function referenceableFields(fields: Field[], fieldId: string) {
  const index = fields.findIndex((f) => f.id === fieldId)
  return fields.slice(0, index + 1).filter((f) => !NON_INPUT_TYPES.includes(f.type))
}

export function operatorsFor(field: Field): { value: LogicOperator; label: string }[] {
  const base: { value: LogicOperator; label: string }[] = [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ]
  if (['short_text', 'long_text', 'email', 'url', 'phone'].includes(field.type)) {
    base.push({ value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'does not contain' })
  }
  if (['number', 'rating', 'opinion_scale', 'date'].includes(field.type)) {
    base.push({ value: 'gt', label: 'is greater than' }, { value: 'lt', label: 'is less than' })
  }
  base.push(
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
    { value: 'always', label: 'always (jump regardless)' },
  )
  return base
}
