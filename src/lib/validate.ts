// Answer validation, shared by the filler and the builder's preview. Returns a
// human-readable message, or null when the answer is acceptable.

import type { AnswerValue, Field } from './types'
import { NON_INPUT_TYPES } from './fieldTypes'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Digits, spaces and the usual separators; 7-20 digits total.
const PHONE_RE = /^[+]?[\d\s().-]{7,25}$/

export function isEmpty(value: AnswerValue): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function validateAnswer(field: Field, value: AnswerValue): string | null {
  if (NON_INPUT_TYPES.includes(field.type)) return null

  if (isEmpty(value)) {
    return field.required ? 'This question is required.' : null
  }

  const text = typeof value === 'string' ? value.trim() : ''
  const { maxLength, min, max } = field.properties

  switch (field.type) {
    case 'email':
      return EMAIL_RE.test(text) ? null : 'Enter a valid email address.'
    case 'phone':
      return PHONE_RE.test(text) && (text.match(/\d/g)?.length ?? 0) >= 7
        ? null
        : 'Enter a valid phone number.'
    case 'url': {
      // Accept a bare domain by trying it with https:// prepended, the way a
      // browser address bar would.
      const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`
      try {
        const url = new URL(candidate)
        return url.hostname.includes('.') ? null : 'Enter a valid website address.'
      } catch {
        return 'Enter a valid website address.'
      }
    }
    case 'number': {
      const n = Number(value)
      if (!Number.isFinite(n)) return 'Enter a number.'
      if (min != null && n < min) return `Must be ${min} or more.`
      if (max != null && n > max) return `Must be ${max} or less.`
      return null
    }
    case 'short_text':
    case 'long_text':
      if (maxLength != null && text.length > maxLength) return `Keep it under ${maxLength} characters.`
      return null
    case 'date':
      return Number.isNaN(Date.parse(String(value))) ? 'Enter a valid date.' : null
    default:
      return null
  }
}

/** Normalise a URL answer so stored values are consistent. */
export function normaliseUrl(value: string) {
  const text = value.trim()
  if (!text) return text
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
}
