import { useCallback, useEffect, useState } from 'react'

export type AppTheme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'formflow:theme'

function read(): AppTheme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

/**
 * Light/dark preference for the editor chrome. "system" removes the attribute
 * entirely so the CSS media query takes over. A form's own theme is separate.
 */
export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(read)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const cycle = useCallback(() => {
    setTheme((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'))
  }, [])

  return { theme, setTheme, cycle }
}
