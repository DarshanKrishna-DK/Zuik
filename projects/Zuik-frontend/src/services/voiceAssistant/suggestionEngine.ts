import type { PageContext } from './commandTypes'

export type SuggestionCategory = 'navigation' | 'workflow' | 'settings' | 'query' | 'proactive'

export interface VoiceSuggestion {
  id: string
  label: string
  phrase: string
  priority: number
  category: SuggestionCategory
}

export interface SuggestionContext {
  pageContext: PageContext
  walletConnected: boolean
  hasCanvasBlocks?: boolean
  agentControlsVisible?: boolean
  lastUserPhrase?: string
}

const GLOBAL_SUGGESTIONS: VoiceSuggestion[] = [
  {
    id: 'nav-builder',
    label: 'Open builder',
    phrase: 'Open the builder',
    priority: 80,
    category: 'navigation',
  },
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    phrase: 'Show my dashboard',
    priority: 75,
    category: 'navigation',
  },
  {
    id: 'nav-settings-agents',
    label: 'Agent settings',
    phrase: 'Go to agent settings',
    priority: 70,
    category: 'settings',
  },
  {
    id: 'query-balance',
    label: 'Wallet balance',
    phrase: 'What is my balance?',
    priority: 65,
    category: 'query',
  },
]

const BUILDER_SUGGESTIONS: VoiceSuggestion[] = [
  {
    id: 'wf-dca',
    label: 'DCA strategy',
    phrase: 'Create a DCA strategy that buys ALGO weekly',
    priority: 95,
    category: 'workflow',
  },
  {
    id: 'wf-run',
    label: 'Run workflow',
    phrase: 'Run my workflow',
    priority: 90,
    category: 'workflow',
  },
  {
    id: 'wf-auto-swap',
    label: 'Auto-swap on receive',
    phrase: 'When I receive USDC, swap it all to ALGO',
    priority: 88,
    category: 'workflow',
  },
  {
    id: 'wf-describe',
    label: 'Explain workflow',
    phrase: 'Describe what my current workflow does',
    priority: 82,
    category: 'workflow',
  },
  {
    id: 'comp-ai',
    label: 'AI assistant',
    phrase: 'Open the AI assistant',
    priority: 78,
    category: 'workflow',
  },
]

const SETTINGS_SUGGESTIONS: VoiceSuggestion[] = [
  {
    id: 'set-risk',
    label: 'Risk tolerance',
    phrase: 'Set risk tolerance to 50',
    priority: 92,
    category: 'settings',
  },
  {
    id: 'fund-agent',
    label: 'Fund agent',
    phrase: 'Fund my agent with 2 ALGO',
    priority: 90,
    category: 'settings',
  },
  {
    id: 'set-telegram',
    label: 'Telegram alerts',
    phrase: 'Go to telegram settings',
    priority: 85,
    category: 'settings',
  },
]

const MARKET_SUGGESTIONS: VoiceSuggestion[] = [
  {
    id: 'market-algo',
    label: 'ALGO price',
    phrase: 'Show ALGO price',
    priority: 88,
    category: 'query',
  },
  {
    id: 'market-builder-swap',
    label: 'Build swap workflow',
    phrase: 'Create a workflow to swap USDC to ALGO',
    priority: 86,
    category: 'workflow',
  },
]

const LANDING_SUGGESTIONS: VoiceSuggestion[] = [
  {
    id: 'landing-start',
    label: 'Start building',
    phrase: 'Start building',
    priority: 95,
    category: 'navigation',
  },
  {
    id: 'landing-connect',
    label: 'Connect wallet',
    phrase: 'Connect my wallet',
    priority: 90,
    category: 'settings',
  },
]

function dedupeById(items: VoiceSuggestion[]): VoiceSuggestion[] {
  const seen = new Set<string>()
  const out: VoiceSuggestion[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function sortByPriority(items: VoiceSuggestion[]): VoiceSuggestion[] {
  return [...items].sort((a, b) => b.priority - a.priority)
}

export function getContextualSuggestions(ctx: SuggestionContext, limit = 5): VoiceSuggestion[] {
  const { pageContext, walletConnected, hasCanvasBlocks, agentControlsVisible } = ctx
  let pool: VoiceSuggestion[] = [...GLOBAL_SUGGESTIONS]

  switch (pageContext.pathname) {
    case '/builder':
      pool = [...BUILDER_SUGGESTIONS, ...pool]
      if (hasCanvasBlocks) {
        pool.unshift({
          id: 'proactive-stop-loss',
          label: 'Add stop-loss',
          phrase: 'Add a stop-loss alert when ALGO drops 10 percent',
          priority: 93,
          category: 'proactive',
        })
      }
      if (agentControlsVisible) {
        pool.unshift({
          id: 'proactive-run-agent',
          label: 'Run agent',
          phrase: 'Run my workflow',
          priority: 94,
          category: 'proactive',
        })
      }
      break
    case '/settings':
      pool = [...SETTINGS_SUGGESTIONS, ...pool]
      break
    case '/market':
      pool = [...MARKET_SUGGESTIONS, ...pool]
      break
    case '/':
      pool = [...LANDING_SUGGESTIONS, ...pool]
      break
    case '/dashboard':
      pool.unshift(
        {
          id: 'dash-open-builder',
          label: 'Edit workflow',
          phrase: 'Open the builder',
          priority: 88,
          category: 'navigation',
        },
        {
          id: 'dash-stats',
          label: 'Dashboard stats',
          phrase: 'Show my dashboard stats',
          priority: 84,
          category: 'query',
        },
      )
      break
    default:
      break
  }

  if (!walletConnected) {
    pool.unshift({
      id: 'connect-wallet',
      label: 'Connect wallet',
      phrase: 'Connect my wallet',
      priority: 96,
      category: 'settings',
    })
  }

  return sortByPriority(dedupeById(pool)).slice(0, limit)
}

export function getProactiveSuggestion(ctx: SuggestionContext): VoiceSuggestion | null {
  const { pageContext, walletConnected, hasCanvasBlocks, agentControlsVisible, lastUserPhrase } = ctx

  if (pageContext.pathname === '/builder' && hasCanvasBlocks && !agentControlsVisible) {
    return {
      id: 'proactive-telegram',
      label: 'Telegram alert',
      phrase: 'Add a Telegram alert when this workflow runs',
      priority: 100,
      category: 'proactive',
    }
  }

  if (pageContext.pathname === '/builder' && hasCanvasBlocks) {
    return {
      id: 'proactive-stop-loss-voice',
      label: 'Stop loss',
      phrase: 'Want me to set a stop-loss alert for this workflow?',
      priority: 99,
      category: 'proactive',
    }
  }

  if (pageContext.pathname === '/settings' && pageContext.settingsSection === 'risk') {
    return {
      id: 'proactive-fund-after-risk',
      label: 'Fund agent',
      phrase: 'Fund my agent with 2 ALGO after setting risk',
      priority: 98,
      category: 'proactive',
    }
  }

  if (!walletConnected && pageContext.pathname !== '/') {
    return {
      id: 'proactive-connect',
      label: 'Connect wallet',
      phrase: 'Connect my wallet to continue',
      priority: 97,
      category: 'proactive',
    }
  }

  if (lastUserPhrase && /\bdca\b/i.test(lastUserPhrase)) {
    return {
      id: 'proactive-dca-telegram',
      label: 'DCA notification',
      phrase: 'Add a Telegram notification when each DCA buy completes',
      priority: 96,
      category: 'proactive',
    }
  }

  return null
}

export function formatSuggestionsForSpeech(suggestions: VoiceSuggestion[], max = 3): string {
  if (suggestions.length === 0) {
    return 'Try saying open builder or ask what is my balance.'
  }
  const phrases = suggestions.slice(0, max).map((s) => s.phrase)
  if (phrases.length === 1) return `Try: ${phrases[0]}.`
  return `Try: ${phrases.join('; ')}.`
}

export function appendProactiveSuggestion(response: string, suggestion: VoiceSuggestion | null): string {
  if (!suggestion) return response
  const trimmed = response.trim()
  if (!trimmed) return suggestion.phrase.endsWith('?') ? suggestion.phrase : `${suggestion.phrase}?`
  if (trimmed.includes('?')) return trimmed
  return `${trimmed} ${suggestion.phrase.endsWith('?') ? suggestion.phrase : `${suggestion.phrase}?`}`
}
