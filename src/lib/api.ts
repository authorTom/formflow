// Thin fetch wrapper. Every call is same-origin and carries the session cookie;
// errors arrive as { error } JSON, which we surface as a thrown ApiError so
// callers can just try/catch.

import type {
  AdminUser,
  Analytics,
  AuditEntry,
  FormDoc,
  FormShare,
  FormSummary,
  Group,
  GroupDetail,
  GroupMember,
  GroupRole,
  InstanceOverview,
  Invite,
  PublicForm,
  ResponseRecord,
  SystemRole,
  UploadRecord,
  User,
} from './types'

export class ApiError extends Error {
  status: number
  /** Set when the server wants the visitor sent to the sign-in screen. */
  requiresAuth: boolean
  constructor(message: string, status: number, requiresAuth = false) {
    super(message)
    this.status = status
    this.requiresAuth = requiresAuth
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
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, !!data?.requiresAuth)
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
  /** Whether this instance still needs its first admin, and whether an invite is valid. */
  registration: (invite?: string) =>
    request<{ firstRun: boolean; inviteRequired: boolean; invite: { email: string; groupName: string | null } | null }>(
      `/api/auth/registration${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`,
    ),
  register: (email: string, password: string, name: string, invite?: string) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: json({ email, password, name, invite }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  updateProfile: (name: string) =>
    request<{ user: User }>('/api/auth/profile', { method: 'PUT', body: json({ name }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/password', {
      method: 'POST',
      body: json({ currentPassword, newPassword }),
    }),
  logoutEverywhere: () => request<{ ok: true }>('/api/auth/logout-all', { method: 'POST' }),

  // --- Groups ---
  listGroups: () => request<{ groups: Group[] }>('/api/groups'),
  createGroup: (name: string, description: string) =>
    request<{ group: Group }>('/api/groups', { method: 'POST', body: json({ name, description }) }),
  getGroup: (id: string) => request<GroupDetail>(`/api/groups/${id}`),
  updateGroup: (id: string, patch: { name?: string; description?: string }) =>
    request<{ group: Group }>(`/api/groups/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteGroup: (id: string) => request<{ ok: true }>(`/api/groups/${id}`, { method: 'DELETE' }),
  addMember: (groupId: string, userId: string, role: GroupRole) =>
    request<{ members: GroupMember[] }>(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: json({ userId, role }),
    }),
  setMemberRole: (groupId: string, userId: string, role: GroupRole) =>
    request<{ members: GroupMember[] }>(`/api/groups/${groupId}/members/${userId}`, {
      method: 'PATCH',
      body: json({ role }),
    }),
  removeMember: (groupId: string, userId: string) =>
    request<{ members: GroupMember[] }>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  // --- Administration ---
  adminOverview: () => request<InstanceOverview>('/api/admin/overview'),
  adminUsers: () => request<{ users: AdminUser[]; groups: Group[] }>('/api/admin/users'),
  updateUser: (id: string, patch: { role?: SystemRole; status?: 'active' | 'suspended'; name?: string }) =>
    request<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteUser: (id: string) => request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/password`, { method: 'POST', body: json({ password }) }),
  revokeUserSessions: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/revoke-sessions`, { method: 'POST' }),
  listInvites: () => request<{ invites: Invite[] }>('/api/admin/invites'),
  createInvite: (body: { email: string; role: SystemRole; groupId: string | null; groupRole: GroupRole }) =>
    request<{ invite: Invite }>('/api/admin/invites', { method: 'POST', body: json(body) }),
  revokeInvite: (token: string) =>
    request<{ ok: true }>(`/api/admin/invites/${token}`, { method: 'DELETE' }),
  auditLog: () => request<{ entries: AuditEntry[] }>('/api/admin/audit'),

  // --- Forms ---
  listForms: () => request<{ forms: FormSummary[] }>('/api/forms'),
  createForm: (title: string, groupId: string) =>
    request<{ form: FormDoc }>('/api/forms', { method: 'POST', body: json({ title, groupId }) }),
  getForm: (id: string) => request<{ form: FormDoc }>(`/api/forms/${id}`),
  saveForm: (id: string, patch: Partial<FormDoc>) =>
    request<{ form: FormDoc }>(`/api/forms/${id}`, { method: 'PUT', body: json(patch) }),
  deleteForm: (id: string) => request<{ ok: true }>(`/api/forms/${id}`, { method: 'DELETE' }),
  duplicateForm: (id: string, groupId?: string) =>
    request<{ form: FormDoc }>(`/api/forms/${id}/duplicate`, { method: 'POST', body: json({ groupId }) }),

  // --- Sharing a form with other groups ---
  listShares: (id: string) =>
    request<{ shares: FormShare[]; candidates: { id: string; name: string }[] }>(`/api/forms/${id}/shares`),
  setShare: (id: string, groupId: string, access: 'edit' | 'view') =>
    request<{ shares: FormShare[] }>(`/api/forms/${id}/shares/${groupId}`, {
      method: 'PUT',
      body: json({ access }),
    }),
  removeShare: (id: string, groupId: string) =>
    request<{ shares: FormShare[] }>(`/api/forms/${id}/shares/${groupId}`, { method: 'DELETE' }),

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
