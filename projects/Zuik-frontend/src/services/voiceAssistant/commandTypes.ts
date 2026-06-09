import type { Location, NavigateFunction } from 'react-router-dom'
import type { SettingsSectionId } from '../../components/settings/types'

export type CommandIntent =
  | 'navigation'
  | 'workflow'
  | 'form'
  | 'transaction'
  | 'component'
  | 'query'
  | 'unknown'

export interface ParsedCommand {
  intent: CommandIntent
  action: string
  params: Record<string, unknown>
  confidence: number
  rawText: string
}

export interface PageContext {
  pathname: string
  search: string
  settingsSection: SettingsSectionId | null
  walletConnected: boolean
  pageLabel: string
  availableIntents: CommandIntent[]
  /** Registered page summary from useVoicePageContext, when available. */
  pageSummary?: string
  pageData?: Record<string, unknown>
}

export interface ActionContext {
  navigate: NavigateFunction
  location: Location
  activeAddress: string | null
  openWalletModal?: () => void
}

export interface ActionResult {
  success: boolean
  message: string
  data?: unknown
  requiresWallet?: boolean
  requiresUserApproval?: boolean
}

export interface CommandProcessorOptions {
  context: ActionContext
  /** When true, unmatched commands get a helpful fallback instead of generic error. */
  includeSuggestions?: boolean
}
