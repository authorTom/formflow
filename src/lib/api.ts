// Thin fetch wrapper. Every call is same-origin and carries the session cookie;
// errors arrive as { error } JSON, which we surface as a thrown ApiError so
// callers can just try/catch.

import type { Analytics, FormDoc, FormSummary, PublicForm, ResponseRecord, UploadRecord, User } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const data = text ? safeParse(text) : null

  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status)
  }
  return data as T
}

function safeParse(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  // --- Auth ---
  me: () => request<{ user: User | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: json({ email, password }) }),
  register: (email: string, password: string, name: string) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: json({ email, password, name }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  // --- Forms ---
  listForms: () => request<{ forms: FormSummary[] }>('/api/forms'),
  createForm: (title: string) =>
    request<{ form: FormDoc }>('/api/forms', { method: 'POST', body: json({ title }) }),
  getForm: (id: string) => request<{ form: FormDoc }>(`/api/forms/${id}`),
  saveForm: (id: string, patch: Partial<FormDoc>) =>
    request<{ form: FormDoc }>(`/api/forms/${id}`, { method: 'PUT', body: json(patch) }),
  deleteForm: (id: string) => request<{ ok: true }>(`/api/forms/${id}`, { method: 'DELETE' }),
  duplicateForm: (id: string) =>
    request<{ form: FormDoc }>(`/api/forms/${id}/duplicate`, { method: 'POST' }),

  // --- Responses ---
  listResponses: (id: string) =>
    request<{ responses: ResponseRecord[]; uploads: UploadRecord[]; fields: FormDoc['fields'] }>(
      `/api/forms/${id}/responses`,
    ),
  deleteResponse: (formId: string, responseId: string) =>
    request<{ ok: true }>(`/api/forms/${formId}/responses/${responseId}`, { method: 'DELETE' }),
  analytics: (id: string) => request<Analytics>(`/api/forms/${id}/analytics`),
  exportUrl: (id: string, format: 'csv' | 'json') => `/api/forms/${id}/export?format=${format}`,
  fileUrl: (formId: string, uploadId: string) => `/api/forms/${formId}/uploads/${uploadId}`,

  // --- Public form filling ---
  publicForm: (slug: string) => request<{ form: PublicForm }>(`/api/public/forms/${slug}`),
  /** Owner-only: preview a draft without publishing it or counting a view. */
  previewForm: (id: string) => request<{ form: PublicForm }>(`/api/forms/${id}/preview`),
  startResponse: (slug: string) =>
    request<{ responseId: string }>(`/api/public/forms/${slug}/responses`, { method: 'POST' }),
  saveAnswer: (responseId: string, fieldId: string, value: unknown) =>
    request<{ ok: true }>(`/api/public/responses/${responseId}`, {
      method: 'PATCH',
      body: json({ fieldId, value }),
    }),
  completeResponse: (responseId: string, endingId: string | null) =>
    request<{ ok: true }>(`/api/public/responses/${responseId}/complete`, {
      method: 'POST',
      body: json({ endingId }),
    }),
  uploadFile: (responseId: string, fieldId: string, file: File) => {
    const body = new FormData()
    body.append('fieldId', fieldId)
    body.append('file', file)
    return request<{ upload: { id: string; name: string; size: number } }>(
      `/api/public/responses/${responseId}/upload`,
      { method: 'POST', body },
    )
  },
}
