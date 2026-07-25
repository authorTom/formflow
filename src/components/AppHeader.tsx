import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LogOut, Monitor, Moon, Shield, Sparkles, Sun, UserCircle, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { useAppTheme } from '../lib/useAppTheme'

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }

/** Top bar shared by every signed-in page. `center` holds page-specific controls. */
export function AppHeader({ center, right }: { center?: ReactNode; right?: ReactNode }) {
  const { user, logout, isAdmin } = useAuth()
  const { theme, cycle } = useAppTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const ThemeIcon = THEME_ICON[theme]

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <Sparkles size={14} />
        </span>
        <span className="hidden-sm">FormFlow</span>
      </Link>

      {/* Page-specific controls take the middle when a page supplies them; the
          builder does, and its own breadcrumb replaces this nav. */}
      {center ? (
        <div className="grow row" style={{ minWidth: 0 }}>
          {center}
        </div>
      ) : (
        <nav className="grow row header-nav" style={{ minWidth: 0, gap: 2 }}>
          <NavLink to="/" end className={({ isActive }) => `header-link ${isActive ? 'header-link-active' : ''}`}>
            Forms
          </NavLink>
          <NavLink to="/groups" className={({ isActive }) => `header-link ${isActive ? 'header-link-active' : ''}`}>
            <Users size={14} />
            Groups
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `header-link ${isActive ? 'header-link-active' : ''}`}>
              <Shield size={14} />
              Admin
            </NavLink>
          )}
        </nav>
      )}

      <div className="row" style={{ gap: 8 }}>
        {right}
        <button
          className="btn btn-ghost btn-icon"
          onClick={cycle}
          title={`Appearance: ${theme}`}
          aria-label={`Appearance: ${theme}. Click to change.`}
        >
          <ThemeIcon size={16} />
        </button>
        <div className="anchor" ref={menuRef}>
          <button className="avatar" onClick={() => setMenuOpen((open) => !open)} aria-label="Account menu">
            {initials}
          </button>
          {menuOpen && (
            <div className="menu">
              <div className="menu-label">
                {user?.email}
                {isAdmin && <div className="tiny">Administrator</div>}
              </div>
              <Link className="menu-item" to="/account" onClick={() => setMenuOpen(false)}>
                <UserCircle size={15} />
                Your account
              </Link>
              {isAdmin && (
                <Link className="menu-item" to="/admin" onClick={() => setMenuOpen(false)}>
                  <Shield size={15} />
                  Administration
                </Link>
              )}
              <hr className="divider" style={{ margin: '4px 0' }} />
              <button className="menu-item menu-item-danger" onClick={logout}>
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
