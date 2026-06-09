import { describe, expect, it, vi } from 'vitest'
import type { Location, NavigateFunction } from 'react-router-dom'
import { createContextManager } from '../voiceAssistant/contextManager'
import { createUnifiedCommandHandler } from '../voiceAssistant/aiIntegration'
import {
  formatSuggestionsForSpeech,
  getContextualSuggestions,
  getProactiveSuggestion,
} from '../voiceAssistant/suggestionEngine'
import { buildPageContext } from '../voiceAssistant/pageContext'
import {
  ClarificationStore,
  buildClarificationFromCommand,
  detectCommandAmbiguity,
  extractClarificationQuestion,
  mergeClarificationAnswer,
  needsClarification,
  resolveClarificationAnswer,
} from '../voiceAssistant/clarificationSystem'
import { classifyCommand } from '../voiceAssistant/intentClassifier'
import type { ParsedIntent } from '../intentParser'

function createTestHandler(overrides: { pathname?: string; activeAddress?: string | null } = {}) {
  const navigate = (() => {}) as NavigateFunction
  const location: Location = {
    pathname: overrides.pathname ?? '/builder',
    search: '',
    hash: '',
    state: null,
    key: 'default',
    unstable_mask: undefined,
  }
  const manager = createContextManager({
    navigate,
    location,
    activeAddress: overrides.activeAddress ?? 'TESTADDRESS',
  })
  return createUnifiedCommandHandler(manager)
}

function testLocation(pathname: string): Location {
  return {
    pathname,
    search: '',
    hash: '',
    state: null,
    key: 'k',
    unstable_mask: undefined,
  }
}

describe('suggestionEngine', () => {
  it('returns builder-focused suggestions on the builder page', () => {
    const pageContext = buildPageContext(testLocation('/builder'), true)
    const suggestions = getContextualSuggestions({
      pageContext,
      walletConnected: true,
      hasCanvasBlocks: true,
    })

    expect(suggestions.some((s) => s.id === 'wf-dca' || s.id === 'proactive-stop-loss')).toBe(true)
  })

  it('prioritizes connect wallet when disconnected', () => {
    const pageContext = buildPageContext(testLocation('/dashboard'), false)
    const suggestions = getContextualSuggestions({ pageContext, walletConnected: false })
    expect(suggestions[0]?.id).toBe('connect-wallet')
  })

  it('returns proactive stop-loss tip when canvas has blocks', () => {
    const pageContext = buildPageContext(testLocation('/builder'), true)
    const tip = getProactiveSuggestion({
      pageContext,
      walletConnected: true,
      hasCanvasBlocks: true,
    })
    expect(tip?.category).toBe('proactive')
  })

  it('formats speech suggestions', () => {
    const pageContext = buildPageContext(testLocation('/'), false)
    const text = formatSuggestionsForSpeech(
      getContextualSuggestions({ pageContext, walletConnected: false }),
    )
    expect(text.toLowerCase()).toContain('try')
  })
})

describe('clarificationSystem', () => {
  it('detects low-confidence ambiguous intents', () => {
    const intent: ParsedIntent = {
      intent: 'swap_tokens',
      steps: [],
      explanation: 'Which asset should I swap - USDC or USDT?',
      confidence: 0.45,
    }
    expect(needsClarification(intent)).toBe(true)
    expect(extractClarificationQuestion(intent)).toContain('?')
  })

  it('merges follow-up answers into the original request', () => {
    const merged = mergeClarificationAnswer('Create a DCA strategy', 'Buy ALGO weekly with 5 USDC')
    expect(merged).toContain('Create a DCA strategy')
    expect(merged).toContain('5 USDC')
  })

  it('tracks pending clarification sessions', () => {
    const store = new ClarificationStore()
    store.setPending({
      originalRequest: 'Swap tokens',
      question: 'How much should I swap?',
      attemptCount: 0,
    })
    expect(store.hasPending()).toBe(true)
    store.clear()
    expect(store.hasPending()).toBe(false)
  })

  it('detects vague settings navigation', () => {
    const pageContext = buildPageContext(testLocation('/dashboard'), true)
    const parsed = classifyCommand('Go to settings', pageContext)
    const kind = detectCommandAmbiguity(parsed, 'Go to settings', pageContext)
    expect(kind).toBe('settings_section')
  })

  it('builds disambiguation session with options', () => {
    const pageContext = buildPageContext(testLocation('/dashboard'), true)
    const parsed = classifyCommand('Go to settings', pageContext)
    const session = buildClarificationFromCommand(parsed, 'Go to settings', pageContext)
    expect(session?.options?.length).toBeGreaterThan(0)
    expect(session?.question.toLowerCase()).toContain('settings')
  })

  it('resolves clarification answers against options', () => {
    const resolved = resolveClarificationAnswer(
      {
        originalRequest: 'Go to settings',
        question: 'Which section?',
        attemptCount: 0,
        kind: 'settings_section',
        options: ['agents', 'risk'],
      },
      'agents please',
    )
    expect(resolved.matchedOption).toBe('agents')
    expect(resolved.resolved.toLowerCase()).toContain('agents')
  })
})

describe('createUnifiedCommandHandler routing', () => {
  it('routes simple navigation commands to the command processor', async () => {
    const navigate = vi.fn()
    const location: Location = {
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
      unstable_mask: undefined,
    }
    const manager = createContextManager({ navigate, location, activeAddress: null })
    const handler = createUnifiedCommandHandler(manager)

    const response = await handler.process('Open the builder')

    expect(navigate).toHaveBeenCalledWith('/builder')
    expect(response.toLowerCase()).toContain('builder')
  })

  it('falls back with contextual suggestions for unknown commands', async () => {
    const handler = createTestHandler({ pathname: '/settings' })
    const response = await handler.process('Perform xyzzy impossible action')
    expect(response.toLowerCase()).toContain('try')
  })

  it('exposes page-aware suggestion list', () => {
    const handler = createTestHandler({ pathname: '/builder' })
    const suggestions = handler.getSuggestions()
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some((s) => s.category === 'workflow')).toBe(true)
  })

  it('exposes shared personality engine', () => {
    const handler = createTestHandler()
    const personality = handler.getPersonalityEngine()
    expect(personality.getGreeting()).toBeTruthy()
  })
})
