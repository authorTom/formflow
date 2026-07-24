// Per-field-type metadata: what it is called, which icon represents it, and the
// properties a freshly added field starts with. The builder's "add question"
// menu is generated from this, so adding a type here is most of the work.

import {
  AlignLeft,
  Calendar,
  ChevronDown,
  CircleDot,
  Gauge,
  Hash,
  Link as LinkIcon,
  Mail,
  Megaphone,
  Paperclip,
  Phone,
  Star,
  ToggleLeft,
  Type,
} from 'lucide-react'
import type { Field, FieldProperties, FieldType } from './types'
import { uid } from './util'

export interface FieldMeta {
  label: string
  hint: string
  icon: typeof Type
  group: 'Text' | 'Choice' | 'Rating' | 'Other'
  defaults: () => { title: string; properties: FieldProperties }
}

export const FIELD_META: Record<FieldType, FieldMeta> = {
  short_text: {
    label: 'Short text',
    hint: 'A single line — names, job titles, anything brief.',
    icon: Type,
    group: 'Text',
    defaults: () => ({ title: 'Your question here', properties: { maxLength: 200 } }),
  },
  long_text: {
    label: 'Long text',
    hint: 'A paragraph box for detailed answers.',
    icon: AlignLeft,
    group: 'Text',
    defaults: () => ({ title: 'Tell us more', properties: { maxLength: 2000 } }),
  },
  email: {
    label: 'Email',
    hint: 'Validated email address.',
    icon: Mail,
    group: 'Text',
    defaults: () => ({ title: 'What is your email address?', properties: { placeholder: 'name@example.com' } }),
  },
  phone: {
    label: 'Phone',
    hint: 'Phone number with light formatting checks.',
    icon: Phone,
    group: 'Text',
    defaults: () => ({ title: 'What is your phone number?', properties: { placeholder: '+44 7700 900000' } }),
  },
  number: {
    label: 'Number',
    hint: 'Numeric answer with optional bounds.',
    icon: Hash,
    group: 'Text',
    defaults: () => ({ title: 'How many?', properties: {} }),
  },
  url: {
    label: 'Website',
    hint: 'A link, validated as a URL.',
    icon: LinkIcon,
    group: 'Text',
    defaults: () => ({ title: 'What is your website?', properties: { placeholder: 'https://example.com' } }),
  },
  multiple_choice: {
    label: 'Multiple choice',
    hint: 'Pick one — or several, if you allow it.',
    icon: CircleDot,
    group: 'Choice',
    defaults: () => ({
      title: 'Which option fits best?',
      properties: {
        choices: [
          { id: uid(8), label: 'Option one' },
          { id: uid(8), label: 'Option two' },
          { id: uid(8), label: 'Option three' },
        ],
        allowMultiple: false,
        randomize: false,
      },
    }),
  },
  dropdown: {
    label: 'Dropdown',
    hint: 'A long list, collapsed into a select.',
    icon: ChevronDown,
    group: 'Choice',
    defaults: () => ({
      title: 'Choose one',
      properties: {
        choices: [
          { id: uid(8), label: 'First choice' },
          { id: uid(8), label: 'Second choice' },
        ],
      },
    }),
  },
  yes_no: {
    label: 'Yes / No',
    hint: 'A two-way answer, ideal for logic branches.',
    icon: ToggleLeft,
    group: 'Choice',
    defaults: () => ({ title: 'Would you recommend us?', properties: {} }),
  },
  rating: {
    label: 'Rating',
    hint: 'Stars, hearts or thumbs.',
    icon: Star,
    group: 'Rating',
    defaults: () => ({ title: 'How would you rate your experience?', properties: { steps: 5, shape: 'star' } }),
  },
  opinion_scale: {
    label: 'Opinion scale',
    hint: 'A numbered scale with labelled ends — NPS style.',
    icon: Gauge,
    group: 'Rating',
    defaults: () => ({
      title: 'How likely are you to recommend us?',
      properties: { steps: 11, startAtOne: false, labels: { left: 'Not at all likely', right: 'Extremely likely' } },
    }),
  },
  date: {
    label: 'Date',
    hint: 'A calendar date.',
    icon: Calendar,
    group: 'Other',
    defaults: () => ({ title: 'When did this happen?', properties: {} }),
  },
  file_upload: {
    label: 'File upload',
    hint: 'Let people attach a document or image.',
    icon: Paperclip,
    group: 'Other',
    defaults: () => ({ title: 'Upload your file', properties: { accept: '' } }),
  },
  statement: {
    label: 'Statement',
    hint: 'Say something without asking anything.',
    icon: Megaphone,
    group: 'Other',
    defaults: () => ({
      title: 'A quick note before we continue',
      properties: { buttonText: 'Continue' },
    }),
  },
}

export const FIELD_GROUPS: FieldMeta['group'][] = ['Text', 'Choice', 'Rating', 'Other']

/** Types that hold a choice list, and so can offer "is / is not" logic on options. */
export const CHOICE_TYPES: FieldType[] = ['multiple_choice', 'dropdown']

/** Types whose answers are numbers, and so support >/< comparisons. */
export const NUMERIC_TYPES: FieldType[] = ['number', 'rating', 'opinion_scale']

/** Types that collect nothing, so they are skipped by validation and exports. */
export const NON_INPUT_TYPES: FieldType[] = ['statement']

export function createField(type: FieldType): Field {
  const { title, properties } = FIELD_META[type].defaults()
  return { id: uid(), type, title, description: '', required: false, properties, logic: [] }
}
