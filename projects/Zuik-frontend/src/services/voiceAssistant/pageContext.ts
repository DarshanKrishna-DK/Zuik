import type { Location } from 'react-router-dom'
import type { SettingsSectionId } from '../../components/settings/types'
import type { CommandIntent, PageContext } from './commandTypes'
import { getActivePageState } from './componentRegistry'

const PAGE_LABELS: Record<string, string> = {
  '/': 'Landing',
  '/builder': 'Builder',
  '/market': 'Market',
  '/dashboard': 'Dashboard',
  '/settings': 'Settings',
}

const LEGACY_SETTINGS_SECTIONS: Record<string, SettingsSectionId> = {
  guardian: 'agents',
  'agent-wallets': 'agents',
  automation: 'agents',
}

function parseSettingsSection(search: string): SettingsSectionId | null {
  const params = new URLSearchParams(search)
  const raw = params.get('section')
  if (!raw) return null
  if (raw in LEGACY_SETTINGS_SECTIONS) {
    return LEGACY_SETTINGS_SECTIONS[raw]
  }
  if (raw === 'account' || raw === 'agents' || raw === 'risk' || raw === 'telegram') {
    return raw
  }
  return null
}

function intentsForPage(pathname: string): CommandIntent[] {
  switch (pathname) {
    case '/builder':
      return ['navigation', 'workflow', 'form', 'transaction', 'component', 'query']
    case '/dashboard':
      return ['navigation', 'workflow', 'transaction', 'query']
    case '/settings':
      return ['navigation', 'form', 'transaction', 'component', 'query']
    case '/market':
      return ['navigation', 'workflow', 'transaction', 'query']
    case '/':
      return ['navigation', 'transaction', 'query']
    default:
      return ['navigation', 'transaction', 'query']
  }
}

export function buildPageContext(location: Location, walletConnected: boolean): PageContext {
  const pathname = location.pathname
  const settingsSection = pathname === '/settings' ? parseSettingsSection(location.search) : null
  const registered = getActivePageState(pathname)

  return {
    pathname,
    search: location.search,
    settingsSection,
    walletConnected,
    pageLabel: PAGE_LABELS[pathname] ?? pathname,
    availableIntents: intentsForPage(pathname),
    pageSummary: registered?.summary,
    pageData: registered?.data,
  }
}

export function describePageContext(ctx: PageContext): string {
  let label = ctx.pageLabel
  if (ctx.pathname === '/settings' && ctx.settingsSection) {
    label = `${ctx.pageLabel} (${ctx.settingsSection} section)`
  }
  if (ctx.pageSummary) {
    return `${label}. ${ctx.pageSummary}`
  }
  return label
}
