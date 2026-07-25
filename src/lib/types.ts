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

/** Who may fill a form in. 'internal' needs a signed-in account. */
export type FormAccess = 'internal' | 'link'

/** What the signed-in user may do with a form. Ordered: view < edit < manage. */
export type Permission = 'view' | 'edit' | 'manage'

export interface FormShare {
  groupId: string
  groupName: string
  access: 'edit' | 'view'
}

export interface FormDoc {
  id: string
  slug: string
  title: string
  published: boolean
  access: FormAccess
  groupId: string | null
  groupName: string | null
  shares: FormShare[]
  permission: Permission
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
  'id' | 'slug' | 'title' | 'access' | 'welcome' | 'theme' | 'settings' | 'fields' | 'endings'
>

export interface FormSummary {
  id: string
  slug: string
  title: string
  published: boolean
  access: FormAccess
  groupId: string | null
  groupName: string | null
  permission: Permission
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
  /** Null when the form was open to anyone with the link — those stay anonymous. */
  respondent: { id: string; email: string; name: string } | null
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

/** System-wide role. Administrators run the instance; members do not. */
export type SystemRole = 'admin' | 'member'

/** Role within one group. */
export type GroupRole = 'manager' | 'editor' | 'viewer'

export interface Group {
  id: string
  name: string
  description: string
  /** The signed-in user's role here, or null when they are not a member. */
  role: GroupRole | null
  memberCount: number
  formCount: number
}

export interface GroupMember {
  id: string
  email: string
  name: string
  status: 'active' | 'suspended'
  systemRole: SystemRole
  role: GroupRole
  joinedAt: string
}

export interface GroupDetail {
  group: { id: string; name: string; description: string; role: GroupRole; createdAt: string }
  members: GroupMember[]
  candidates: { id: string; email: string; name: string }[]
}

export interface User {
  id: string
  email: string
  name: string
  role: SystemRole
  status: 'active' | 'suspended'
  /** Present on the signed-in user; the groups they belong to, with their role. */
  groups?: Group[]
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: SystemRole
  status: 'active' | 'suspended'
  createdAt: string
  groups: { id: string; name: string; role: GroupRole }[]
  formCount: number
  activeSessions: number
}

export interface Invite {
  token: string
  email: string
  role: SystemRole
  groupId: string | null
  groupName: string | null
  groupRole: GroupRole
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  status: 'pending' | 'accepted' | 'expired'
}

export interface AuditEntry {
  id: number
  at: string
  actorId: string | null
  actorEmail: string
  action: string
  targetType: string
  targetId: string
  detail: Record<string, unknown>
}

export interface InstanceOverview {
  users: number
  admins: number
  suspended: number
  groups: number
  forms: number
  openForms: number
  pendingInvites: number
  responses: number
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
