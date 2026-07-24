// Answer recall: a question can quote an earlier answer by embedding
// {{field:ID}} in its title or description. The builder inserts these tokens,
// the filler substitutes them at display time.

import type { AnswerMap, AnswerValue, Field } from './types'

// Field ids generated here are lowercase alphanumerics, but ids can also arrive
// from an imported or hand-written form, so accept anything id-shaped.
const TOKEN_RE = /\{\{field:([\w-]+)\}\}/g

export function answerText(value: AnswerValue): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return value.name
  return String(value)
}

/**
 * Replace recall tokens with the respondent's answers. Unanswered or deleted
 * references fall back to `fallback` so a sentence never reads "Hi {{field:x}}".
 */
export function applyRecall(text: string, answers: AnswerMap, fallback = 'your answer') {
  if (!text) return ''
  return text.replace(TOKEN_RE, (_match, fieldId: string) => {
    const value = answers[fieldId]
    const rendered = answerText(value)
    return rendered || fallback
  })
}

/**
 * Owner-facing rendering of a question title. There is no respondent to quote
 * in the editor, the responses table or analytics, so each token becomes a
 * short marker naming the question it will pull from.
 */
export function describeRecall(text: string, fields: Field[]) {
  if (!text) return ''
  return text.replace(TOKEN_RE, (_match, fieldId: string) => {
    const index = fields.findIndex((f) => f.id === fieldId)
    return index < 0 ? '[deleted answer]' : `[Q${index + 1} answer]`
  })
}

export function recallToken(fieldId: string) {
  return `{{field:${fieldId}}}`
}

export function hasRecall(text: string) {
  // A fresh regex per call: `.test()` on a /g regex advances lastIndex, so a
  // shared instance would return alternating answers for the same input.
  return new RegExp(TOKEN_RE.source).test(text)
}
