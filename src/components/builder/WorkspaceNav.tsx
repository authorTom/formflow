import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, Inbox, Palette, PencilRuler, Share2 } from 'lucide-react'
import { classes } from '../../lib/util'

export type WorkspaceTab = 'build' | 'design' | 'share' | 'results' | 'analytics'

const TABS: { id: WorkspaceTab; label: string; icon: typeof Inbox }[] = [
  { id: 'build', label: 'Build', icon: PencilRuler },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'share', label: 'Share', icon: Share2 },
  { id: 'results', label: 'Responses', icon: Inbox },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
]

/**
 * The five views of one form. Build/Design/Share are tabs within the builder
 * route; Responses and Analytics are their own pages, so this handles both.
 */
export function WorkspaceNav({
  formId,
  active,
  onSelectTab,
}: {
  formId: string
  active: WorkspaceTab
  onSelectTab?: (tab: WorkspaceTab) => void
}) {
  const navigate = useNavigate()

  return (
    <nav className="tabbar" aria-label="Form sections">
      {TABS.map((tab) => {
        const isBuilderTab = tab.id === 'build' || tab.id === 'design' || tab.id === 'share'
        const href =
          tab.id === 'results'
            ? `/forms/${formId}/results`
            : tab.id === 'analytics'
              ? `/forms/${formId}/analytics`
              : `/forms/${formId}?tab=${tab.id}`

        return (
          <Link
            key={tab.id}
            to={href}
            className={classes('tab', active === tab.id && 'active')}
            aria-current={active === tab.id ? 'page' : undefined}
            onClick={(event) => {
              // Inside the builder, switching tabs should not remount the page.
              if (isBuilderTab && onSelectTab) {
                event.preventDefault()
                onSelectTab(tab.id)
                navigate(href, { replace: true })
              }
            }}
          >
            <tab.icon size={15} />
            <span className="hidden-sm">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
