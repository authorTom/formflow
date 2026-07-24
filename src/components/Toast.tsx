import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, Check } from 'lucide-react'

interface Toast {
  id: number
  message: string
  tone: 'ok' | 'error'
}

interface ToastApi {
  toast: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), tone === 'error' ? 5000 : 2800)
  }, [])

  const value = useMemo<ToastApi>(
    () => ({ toast: (message) => push(message, 'ok'), error: (message) => push(message, 'error') }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={item.tone === 'error' ? 'toast toast-error' : 'toast'}>
            {item.tone === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
            <span className="grow">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
