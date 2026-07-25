import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { Group, GroupRole, User } from '../lib/types'

interface AuthState {
  user: User | null
  loading: boolean
  /** Groups the signed-in user belongs to, with their role in each. */
  groups: Group[]
  isAdmin: boolean
  /** Groups they may create a form in — anywhere they are not merely a viewer. */
  writableGroups: Group[]
  roleIn: (groupId: string | null) => GroupRole | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, invite?: string) => Promise<void>
  logout: () => Promise<void>
  /** Re-reads the session, e.g. after group membership changes. */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // One call on mount tells us whether the session cookie is still good. Public
  // form pages render regardless, so a 401 here is not an error.
  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((data) => !cancelled && setUser(data.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { user: next } = await api.login(email, password)
    setUser(next)
  }, [])

  const register = useCallback(async (email: string, password: string, name: string, invite?: string) => {
    const { user: next } = await api.register(email, password, name, invite)
    setUser(next)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    const data = await api.me().catch(() => ({ user: null }))
    setUser(data.user)
  }, [])

  const value = useMemo<AuthState>(() => {
    const groups = user?.groups ?? []
    return {
      user,
      loading,
      groups,
      isAdmin: user?.role === 'admin',
      // An administrator is not automatically in every group, but may act in
      // any of them, so the server accepts whatever it is given. The client
      // still offers only the groups it knows about.
      writableGroups: groups.filter((g) => g.role === 'manager' || g.role === 'editor'),
      roleIn: (groupId) => groups.find((g) => g.id === groupId)?.role ?? null,
      login,
      register,
      logout,
      refresh,
    }
  }, [user, loading, login, register, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
