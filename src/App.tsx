import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { ToastProvider } from './components/Toast'
import { LoginPage, RegisterPage } from './pages/Auth'
import { DashboardPage } from './pages/Dashboard'
import { BuilderPage } from './pages/Builder'
import { ResultsPage } from './pages/Results'
import { AnalyticsPage } from './pages/Analytics'
import { FillPage } from './pages/Fill'

function Loading() {
  return (
    <div className="page-loading">
      <div className="spinner" />
      <span className="small">Loading…</span>
    </div>
  )
}

/** Sends signed-out visitors to /login, remembering where they were headed. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

/** Keeps signed-in users out of the login and register screens. */
function RequireAnon({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public — a respondent never needs an account. */}
            <Route path="/f/:slug" element={<FillPage />} />
            {/* Owner preview keys off the form id so drafts work too. */}
            <Route path="/preview/:id" element={<FillPage preview />} />

            <Route
              path="/login"
              element={
                <RequireAnon>
                  <LoginPage />
                </RequireAnon>
              }
            />
            <Route
              path="/register"
              element={
                <RequireAnon>
                  <RegisterPage />
                </RequireAnon>
              }
            />

            <Route
              path="/"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/forms/:id"
              element={
                <RequireAuth>
                  <BuilderPage />
                </RequireAuth>
              }
            />
            <Route
              path="/forms/:id/results"
              element={
                <RequireAuth>
                  <ResultsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/forms/:id/analytics"
              element={
                <RequireAuth>
                  <AnalyticsPage />
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
