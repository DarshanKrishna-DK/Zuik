import type { ParsedIntent, UserContext } from '../intentParser'
import { parseIntent } from '../intentParser'
import type { VoiceContextManager } from './contextManager'
import { createCommandProcessor } from './commandProcessor'
import type { ParsedCommand } from './commandTypes'
import { classifyCommand } from './intentClassifier'
import {
  buildClarificationFromCommand,
  buildClarificationFromIntent,
  ClarificationStore,
  formatClarificationPrompt,
  needsClarification,
  resolveClarificationAnswer,
} from './clarificationSystem'
import {
  createPersonalityEngine,
  type PersonalityEngine,
} from './personalityEngine'
import {
  appendProactiveSuggestion,
  formatSuggestionsForSpeech,
  getContextualSuggestions,
  getProactiveSuggestion,
  type SuggestionContext,
  type VoiceSuggestion,
} from './suggestionEngine'
import { getActivePageState, getShellState } from './componentRegistry'
import { dispatchVoiceIntent, getVoiceCanvasBlocks } from './voiceBridge'
import { executeNavigationAction } from './actions/navigationActions'

const COMMAND_CONFIDENCE_THRESHOLD = 0.72
const MAX_CLARIFICATION_ATTEMPTS = 2

const WORKFLOW_AI_PATTERNS =
  /\b(?:swap|buy|sell|dca|dollar\s+cost|when\s+i\s+receive|every\s+(?:hour|day|week|month)|alert\s+me|stop[\s-]?loss|take[\s-]?profit|send\s+telegram|notify|strategy|accumulate|rebalance|workflow\s+that|build\s+me|set\s+up|modify|change\s+the|delete\s+the|remove\s+the|add\s+a|describe\s+(?:my|this|the)\s+workflow|explain\s+(?:my|this|the)\s+workflow)\b/i

const QUESTION_PATTERNS =
  /\b(?:what|why|how|explain|describe|tell\s+me\s+about|recommend|suggest\s+a\s+strategy|should\s+i)\b/i

const SIMPLE_COMMAND_ACTIONS = new Set([
  'go_home',
  'go_builder',
  'go_market',
  'go_dashboard',
  'go_settings',
  'go_settings_section',
  'go_market_asset',
  'connect_wallet',
  'create_workflow',
  'run_workflow',
  'stop_workflow',
  'pause_workflow',
  'resume_workflow',
  'open_ai_assistant',
  'open_execution_log',
  'clear_canvas',
  'set_risk_tolerance',
  'fund_agent',
  'prepare_send_payment',
  'prepare_fund_agent',
  'prepare_agent_payment',
  'set_telegram_chat_id',
  'rename_workflow',
  'click_testid',
  'toggle_execution_mode',
  'toggle_sidebar',
  'open_templates',
  'wallet_balance',
  'execution_history',
  'dashboard_stats',
  'current_page',
  'risk_tolerance',
  'help',
])

export interface AiConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiIntegrationOptions {
  clarificationStore?: ClarificationStore
  personalityEngine?: PersonalityEngine
  advisorModeForQuestions?: boolean
  includeProactiveSuggestions?: boolean
  onSuggestionsUpdated?: (suggestions: VoiceSuggestion[]) => void
}

export interface UnifiedCommandHandler {
  process: (text: string) => Promise<string>
  classify: (text: string) => ParsedCommand
  getSuggestions: () => VoiceSuggestion[]
  getProactiveSuggestion: () => VoiceSuggestion | null
  getConversationHistory: () => AiConversationTurn[]
  getPersonalityEngine: () => PersonalityEngine
}

function isComplexWorkflowDescription(text: string): boolean {
  return WORKFLOW_AI_PATTERNS.test(text)
}

function isQuestionLike(text: string): boolean {
  return QUESTION_PATTERNS.test(text) || text.trim().endsWith('?')
}

function shouldUseCommandProcessor(parsed: ParsedCommand, text: string): boolean {
  if (parsed.intent === 'unknown') return false
  if (parsed.confidence < COMMAND_CONFIDENCE_THRESHOLD) return false
  if (isComplexWorkflowDescription(text)) return false
  if (isQuestionLike(text) && parsed.intent !== 'query') return false
  return SIMPLE_COMMAND_ACTIONS.has(parsed.action)
}

function shouldUseAi(parsed: ParsedCommand, text: string): boolean {
  if (isComplexWorkflowDescription(text)) return true
  if (isQuestionLike(text) && parsed.intent === 'unknown') return true
  if (parsed.intent === 'unknown' && WORKFLOW_AI_PATTERNS.test(text)) return true
  if (parsed.action === 'create_dca_workflow') return true
  if (parsed.action === 'send_ai_message') return true
  return false
}

function buildSuggestionContext(
  contextManager: VoiceContextManager,
  lastUserPhrase?: string,
): SuggestionContext {
  const pageContext = contextManager.getPageContext()
  const canvasBlocks = getVoiceCanvasBlocks()
  const registered = getActivePageState(pageContext.pathname)
  const agentControlsVisible = Boolean(
    registered?.data?.agentControlsVisible ??
      (typeof document !== 'undefined' && document.querySelector('.zuik-agent-controls')),
  )
  const hasCanvasBlocks =
    typeof registered?.data?.blockCount === 'number'
      ? registered.data.blockCount > 0
      : canvasBlocks.length > 0

  return {
    pageContext,
    walletConnected: pageContext.walletConnected,
    hasCanvasBlocks,
    agentControlsVisible,
    lastUserPhrase,
  }
}

function buildUserContext(contextManager: VoiceContextManager): UserContext {
  const actionCtx = contextManager.getActionContext()
  const pageContext = contextManager.getPageContext()
  const shell = getShellState()
  const telegramChatId =
    typeof window !== 'undefined' ? localStorage.getItem('zuik_telegram_chat_id') || undefined : undefined

  return {
    walletAddress: actionCtx.activeAddress ?? undefined,
    telegramChatId: telegramChatId || undefined,
    currentPage: pageContext.pageSummary
      ? `${pageContext.pageLabel}: ${pageContext.pageSummary}`
      : pageContext.pageLabel,
    walletBalanceSummary: shell?.walletSummary ?? undefined,
  }
}

function formatIntentResponse(intent: ParsedIntent, proactive: VoiceSuggestion | null): string {
  const primary = (intent.advisor_message ?? intent.explanation ?? '').trim()
  let response = primary

  if (intent.steps?.length) {
    const blockCount = intent.steps.length
    const strategy = intent.strategy_name ? ` (${intent.strategy_name})` : ''
    if (!response.toLowerCase().includes('block')) {
      response = response
        ? `${response} I added ${blockCount} block${blockCount === 1 ? '' : 's'}${strategy} to your canvas.`
        : `Done. I added ${blockCount} block${blockCount === 1 ? '' : 's'}${strategy} to your canvas.`
    }
  }

  if (intent.intent === 'modify_block' && intent.modifications?.length) {
    response = response || 'Updated your workflow blocks on the canvas.'
  }

  if (intent.intent === 'delete_block' && intent.deleteNodeIds?.length) {
    response = response || 'Removed the requested blocks from your canvas.'
  }

  if (!response) {
    response = 'Done.'
  }

  return appendProactiveSuggestion(response, proactive)
}

async function ensureBuilderForWorkflow(contextManager: VoiceContextManager): Promise<void> {
  const ctx = contextManager.getActionContext()
  if (ctx.location.pathname === '/builder') return
  await executeNavigationAction('go_builder', {}, ctx)
  await new Promise((resolve) => setTimeout(resolve, 350))
}

function isWorkflowIntent(intent: ParsedIntent): boolean {
  if (intent.steps?.length) return true
  return (
    intent.intent === 'modify_block' ||
    intent.intent === 'delete_block' ||
    (intent.replaceCanvas === true && intent.steps?.length === 0)
  )
}

export function createUnifiedCommandHandler(
  contextManager: VoiceContextManager,
  options: AiIntegrationOptions = {},
): UnifiedCommandHandler {
  const clarificationStore = options.clarificationStore ?? new ClarificationStore()
  const personality =
    options.personalityEngine ?? createPersonalityEngine(contextManager)
  const includeProactive = options.includeProactiveSuggestions ?? true
  const commandProcessor = createCommandProcessor(contextManager, { includeSuggestions: false })
  const conversationHistory: AiConversationTurn[] = []
  let lastUserPhrase: string | undefined

  function wrapResponse(
    raw: string,
    kind: 'success' | 'clarification' | 'error' | 'unknown' | 'proactive',
    extra?: { clarificationAttempt?: number; errorMessage?: string },
  ): string {
    const pageContext = contextManager.getPageContext()
    return personality.personalizeResponse(raw, kind, {
      pathname: pageContext.pathname,
      pageLabel: pageContext.pageLabel,
      walletConnected: pageContext.walletConnected,
      clarificationAttempt: extra?.clarificationAttempt,
      errorType: extra?.errorMessage
        ? personality.classifyError(extra.errorMessage)
        : undefined,
    })
  }

  function pushHistory(role: 'user' | 'assistant', content: string): void {
    conversationHistory.push({ role, content })
    if (conversationHistory.length > 24) {
      conversationHistory.splice(0, conversationHistory.length - 24)
    }
  }

  function notifySuggestions(): VoiceSuggestion[] {
    const suggestions = getContextualSuggestions(buildSuggestionContext(contextManager, lastUserPhrase))
    options.onSuggestionsUpdated?.(suggestions)
    return suggestions
  }

  async function processWithAi(text: string): Promise<string> {
    const canvasBlocks = getVoiceCanvasBlocks()
    const userContext = buildUserContext(contextManager)
    const useAdvisor = options.advisorModeForQuestions !== false && isQuestionLike(text)
    const suggestionCtx = buildSuggestionContext(contextManager, text)
    const proactive = includeProactive ? getProactiveSuggestion(suggestionCtx) : null

    const intent = await parseIntent(
      text,
      conversationHistory,
      useAdvisor,
      canvasBlocks,
      userContext,
    )

    if (needsClarification(intent)) {
      const session = buildClarificationFromIntent(intent, text)
      clarificationStore.setPending(session)
      pushHistory('user', text)
      const prompt = formatClarificationPrompt(session)
      pushHistory('assistant', prompt)
      notifySuggestions()
      return wrapResponse(prompt, 'clarification', { clarificationAttempt: 0 })
    }

    clarificationStore.clear()

    if (isWorkflowIntent(intent)) {
      await ensureBuilderForWorkflow(contextManager)
      dispatchVoiceIntent(intent)
    }

    const response = formatIntentResponse(intent, proactive)
    pushHistory('user', text)
    pushHistory('assistant', response)
    personality.recordSuccess(intent.intent)
    notifySuggestions()
    return wrapResponse(response, 'success')
  }

  async function processClarificationFollowUp(text: string): Promise<string> {
    const pending = clarificationStore.getPending()
    if (!pending) return processMain(text)

    clarificationStore.incrementAttempt()
    const attempt = pending.attemptCount + 1
    const { resolved: merged } = resolveClarificationAnswer(pending, text)
    clarificationStore.clear()

    if (attempt >= MAX_CLARIFICATION_ATTEMPTS) {
      pushHistory('user', text)
      const fallback = personality.formatUnknownCommand(
        getContextualSuggestions(buildSuggestionContext(contextManager, merged)),
      )
      const message = `I still need more detail. ${fallback}`
      pushHistory('assistant', message)
      personality.recordFailure()
      return wrapResponse(message, 'unknown')
    }

    return processWithAi(merged)
  }

  async function processMain(text: string): Promise<string> {
    lastUserPhrase = text
    const pageContext = contextManager.getPageContext()
    const parsed = classifyCommand(text, pageContext)

    const commandClarification = buildClarificationFromCommand(parsed, text, pageContext)
    if (commandClarification && !shouldUseAi(parsed, text)) {
      clarificationStore.setPending(commandClarification)
      pushHistory('user', text)
      const prompt = formatClarificationPrompt(commandClarification)
      pushHistory('assistant', prompt)
      notifySuggestions()
      return wrapResponse(prompt, 'clarification', { clarificationAttempt: 0 })
    }

    if (shouldUseCommandProcessor(parsed, text)) {
      try {
        const response = await commandProcessor.process(text)
        pushHistory('user', text)
        pushHistory('assistant', response)

        const proactive = includeProactive
          ? getProactiveSuggestion(buildSuggestionContext(contextManager, text))
          : null
        const finalResponse = appendProactiveSuggestion(response, proactive)
        personality.recordSuccess(parsed.action)
        notifySuggestions()
        return wrapResponse(finalResponse, 'success')
      } catch (error) {
        personality.recordFailure()
        const message = error instanceof Error ? error.message : 'Command failed'
        return wrapResponse(
          personality.personalizeResponse(message, 'error', {
            errorType: personality.classifyError(message),
          }),
          'error',
          { errorMessage: message },
        )
      }
    }

    if (shouldUseAi(parsed, text)) {
      return processWithAi(text)
    }

    if (parsed.intent !== 'unknown' && parsed.confidence >= COMMAND_CONFIDENCE_THRESHOLD) {
      try {
        const response = await commandProcessor.process(text)
        pushHistory('user', text)
        pushHistory('assistant', response)
        personality.recordSuccess(parsed.action)
        notifySuggestions()
        return wrapResponse(response, 'success')
      } catch (error) {
        personality.recordFailure()
        const message = error instanceof Error ? error.message : 'Command failed'
        return wrapResponse(
          personality.personalizeResponse(message, 'error', {
            errorType: personality.classifyError(message),
          }),
          'error',
          { errorMessage: message },
        )
      }
    }

    const suggestions = getContextualSuggestions(buildSuggestionContext(contextManager, text))
    notifySuggestions()
    personality.recordFailure()
    return wrapResponse(personality.formatUnknownCommand(suggestions), 'unknown')
  }

  return {
    classify(text: string) {
      return classifyCommand(text, contextManager.getPageContext())
    },

    getSuggestions() {
      return getContextualSuggestions(buildSuggestionContext(contextManager, lastUserPhrase))
    },

    getProactiveSuggestion() {
      return getProactiveSuggestion(buildSuggestionContext(contextManager, lastUserPhrase))
    },

    getConversationHistory() {
      return [...conversationHistory]
    },

    async process(text: string): Promise<string> {
      const trimmed = text.trim()
      if (!trimmed) {
        return personality.formatEmptyInputPrompt()
      }

      if (clarificationStore.hasPending()) {
        return processClarificationFollowUp(trimmed)
      }

      return processMain(trimmed)
    },

    getPersonalityEngine() {
      return personality
    },
  }
}

export function createAiCommandHandler(
  contextManager: VoiceContextManager,
  options?: AiIntegrationOptions,
): (text: string) => Promise<string> {
  return createUnifiedCommandHandler(contextManager, options).process
}
