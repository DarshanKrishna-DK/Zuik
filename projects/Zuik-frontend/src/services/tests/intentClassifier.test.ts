import { describe, expect, it } from 'vitest'
import { classifyCommand, getSuggestions } from '../voiceAssistant/intentClassifier'
import { buildPageContext } from '../voiceAssistant/pageContext'

const builderContext = buildPageContext(
  {
    pathname: '/builder',
    search: '',
    hash: '',
    state: null,
    key: 'default',
    unstable_mask: undefined,
  },
  true,
)

describe('classifyCommand', () => {
  it('classifies navigation to builder', () => {
    const result = classifyCommand('Hey Zuik, open the builder')
    expect(result.intent).toBe('navigation')
    expect(result.action).toBe('go_builder')
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('classifies settings section navigation', () => {
    const result = classifyCommand('Go to agent settings')
    expect(result.intent).toBe('navigation')
    expect(result.action).toBe('go_settings_section')
    expect(result.params.section).toBe('agents')
  })

  it('classifies risk form commands', () => {
    const result = classifyCommand('Set risk tolerance to 50')
    expect(result.intent).toBe('form')
    expect(result.action).toBe('set_risk_tolerance')
    expect(result.params.value).toBe(50)
  })

  it('classifies wallet balance queries', () => {
    const result = classifyCommand("What's my balance?")
    expect(result.intent).toBe('query')
    expect(result.action).toBe('wallet_balance')
  })

  it('classifies workflow run commands on builder context', () => {
    const result = classifyCommand('Run my DCA strategy', builderContext)
    expect(result.intent).toBe('workflow')
    expect(result.action).toBe('run_workflow')
  })

  it('classifies fund agent form commands', () => {
    const result = classifyCommand('Fund agent with 2 ALGO')
    expect(result.intent).toBe('form')
    expect(result.action).toBe('fund_agent')
    expect(result.params.amount).toBe(2)
  })

  it('returns unknown for unrelated speech', () => {
    const result = classifyCommand('Tell me a joke about cats')
    expect(result.intent).toBe('unknown')
  })
})

describe('getSuggestions', () => {
  it('returns builder-specific suggestions on builder page', () => {
    const suggestions = getSuggestions(builderContext)
    expect(suggestions.some((s) => s.toLowerCase().includes('workflow'))).toBe(true)
  })
})
