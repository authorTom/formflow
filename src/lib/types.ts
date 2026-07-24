// Shared shapes for the whole client. The server stores properties/logic/theme
// as opaque JSON, so these types are the single source of truth for their shape.

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'url'
  | 'multiple_choice'
  | 'dropdown'
  | 'yes_no'
  | 'rating'
  | 'opinion_scale'
  | 'date'
  | 'file_upload'
  | 'statement'

export interface Choice {
  id: string
  label: string
}

export interface FieldProperties {
  placeholder?: string
  /** multiple_choice / dropdown */
  choices?: Choice[]
  allowMultiple?: boolean
  randomize?: boolean
  /** short_text / long_text */
  maxLength?: number
  /** number */
  min?: number
  max?: number
  /** rating */
  shape?: 'star' | 'heart' | 'thumb'
  steps?: number
  /** opinion_scale */
  labels?: { left?: string; right?: string }
  startAtOne?: boolean
  /** statement */
  buttonText?: string
  /** file_upload */
  accept?: string
}

export type LogicOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'lt'
  | 'is_empty'
  | 'is_not_empty'
  | 'always'

export interface LogicRule {
  id: string
  /** Which field's answer to test. Defaults to the field the rule lives on. */
  fieldId?: string
  operator: LogicOperator
  value?: string | number | boolean | null
  targetType: 'field' | 'ending'
  targetId: string
}

export interface Field {
  id: string
  type: FieldType
  title: string
  description: string
  required: boolean
  properties: FieldProperties
  logic: LogicRule[]
}

export interface Ending {
  id: string
  title: string
  description: string
  buttonText: string
  buttonUrl: string
  redirectUrl: string
}

export interface Welcome {
  enabled: boolean
  title: string
  description: string
  buttonText: string
}

export interface Theme {
  accent: string
  background: string
  text: string
  font: 'sans' | 'serif' | 'mono'
  backgroundStyle: 'solid' | 'gradient' | 'dots'
}

export interface FormSettings {
  showProgressBar: boolean
  showQuestionNumbers: boolean
  closedMessage: string
}

export interface FormDoc {
  id: string
  slug: string
  title: string
  published: boolean
  welcome: Welcome
  theme: Theme
  settings: FormSettings
  createdAt: string
  updatedAt: string
  fields: Field[]
  endings: Ending[]
}

/** What /api/public/forms/:slug returns — no owner-only metadata. */
export type PublicForm = Pick<
  FormDoc,
  'id' | 'slug' | 'title' | 'welcome' | 'theme' | 'settings' | 'fields' | 'endings'
>

export interface FormSummary {
  id: string
  slug: string
  title: string
  published: boolean
  theme: Theme
  createdAt: string
  updatedAt: string
  stats: { views: number; starts: number; completions: number; fields: number }
}

export type AnswerValue = string | number | boolean | string[] | { uploadId: string; name: string; size: number } | null

export type AnswerMap = Record<string, AnswerValue>

export interface ResponseRecord {
  id: string
  formId: string
  startedAt: string
  submittedAt: string | null
  completed: boolean
  durationMs: number | null
  endingId: string | null
  meta: { userAgent?: string; referrer?: string }
  answers: AnswerMap
}

export interface UploadRecord {
  id: string
  response_id: string
  field_id: string
  original_name: string
  size: number
  mime: string
}

export interface User {
  id: string
  email: string
  name: string
}

export interface Analytics {
  summary: {
    views: number
    starts: number
    completions: number
    completionRate: number
    viewToStartRate: number
    averageDurationMs: number | null
  }
  daily: { day: string; starts: number; completions: number }[]
  questions: QuestionStats[]
  funnel: { id: string; title: string; reached: number; dropOff: number }[]
}

export type QuestionStats =
  | {
      id: string
      title: string
      type: FieldType
      answered: number
      kind: 'choice'
      options: { label: string; count: number }[]
    }
  | {
      id: string
      title: string
      type: FieldType
      answered: number
      kind: 'numeric'
      average: number | null
      min: number | null
      max: number | null
      distribution: { value: number; count: number }[]
    }
  | {
      id: string
      title: string
      type: FieldType
      answered: number
      kind: 'text'
      samples: string[]
    }

export const DEFAULT_THEME: Theme = {
  accent: '#4f46e5',
  background: '#ffffff',
  text: '#14161c',
  font: 'sans',
  backgroundStyle: 'solid',
}

export const DEFAULT_SETTINGS: FormSettings = {
  showProgressBar: true,
  showQuestionNumbers: true,
  closedMessage: 'This form is no longer accepting responses.',
}
