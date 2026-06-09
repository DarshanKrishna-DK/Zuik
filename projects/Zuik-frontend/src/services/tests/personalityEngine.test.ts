import { describe, expect, it, beforeEach } from 'vitest'
import {
  ConversationMemory,
  PersonalityEngine,
  loadUserPreferences,
} from '../voiceAssistant/personalityEngine'
import { buildPageContext } from '../voiceAssistant/pageContext'
import { getContextualSuggestions } from '../voiceAssistant/suggestionEngine'
import type { Location } from 'react-router-dom'

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

describe('ConversationMemory', () => {
  it('tracks experience level from session activity', () => {
    const memory = new ConversationMemory({
      ...loadUserPreferences(),
      sessionCount: 3,
      successfulCommands: 4,
    })
    expect(memory.getExperienceLevel()).toBe('returning')

    memory.recordSuccess('workflow')
    memory.recordSuccess('workflow')

    expect(memory.getExperienceLevel()).toBe('returning')
  })

  it('flags proactive help after consecutive failures', () => {
    const memory = new ConversationMemory()
    expect(memory.shouldOfferProactiveHelp()).toBe(false)
    memory.recordFailure()
    memory.recordFailure()
    expect(memory.shouldOfferProactiveHelp()).toBe(true)
  })
})

describe('PersonalityEngine', () => {
  let engine: PersonalityEngine

  beforeEach(() => {
    engine = new PersonalityEngine({ memory: new ConversationMemory() })
  })

  it('returns varied greetings for new users', () => {
    const greeting = engine.getGreeting({ fromWakeWord: true })
    expect(greeting.length).toBeGreaterThan(10)
  })

  it('formats clarification with attempt-aware phrasing', () => {
    const first = engine.formatClarificationQuestion('Which asset should I swap?', 0)
    const second = engine.formatClarificationQuestion('Which asset should I swap?', 1)
    expect(first).toContain('?')
    expect(second.toLowerCase()).toContain('detail')
  })

  it('classifies errors for recovery messaging', () => {
    expect(engine.classifyError('Microphone access denied')).toBe('microphone')
    expect(engine.classifyError('No speech detected')).toBe('stt')
    expect(engine.classifyError('Failed to fetch')).toBe('network')
  })

  it('formats unknown commands with contextual suggestions', () => {
    const pageContext = buildPageContext(testLocation('/builder'), true)
    const suggestions = getContextualSuggestions({ pageContext, walletConnected: true })
    const message = engine.formatUnknownCommand(suggestions)
    expect(message.toLowerCase()).toContain('try')
  })

  it('escalates empty-input prompts', () => {
    expect(engine.formatEmptyInputPrompt(0)).not.toContain('End session')
    expect(engine.formatEmptyInputPrompt(2).toLowerCase()).toContain('end session')
  })
})
