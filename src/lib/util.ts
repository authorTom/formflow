const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz0123456789'

/** Client-side id for new fields, endings and choices. Matches the server's shape. */
export function uid(length = 12) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length]
  return out
}

export function classes(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ')
}

export function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(iso: string) {
  const diff = Date.now() - Date.parse(iso)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Counterpart to formatRelative for timestamps in the future — an invitation's
 * expiry, say. formatRelative would call every one of those "just now", since
 * it only ever measures how long ago something happened.
 */
export function formatUntil(iso: string) {
  const diff = Date.parse(iso) - Date.now()
  if (diff <= 0) return 'now'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `in ${Math.max(1, minutes)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

export function formatDuration(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function percent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

/**
 * Runs `fn` at most once per `delay` of quiet. Used by the builder's autosave so
 * typing a question title does not fire a request per keystroke.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
  wrapped.cancel = () => timer && clearTimeout(timer)
  return wrapped
}
