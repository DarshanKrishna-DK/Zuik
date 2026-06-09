import { describe, expect, it } from 'vitest'
import type { Location } from 'react-router-dom'
import { buildPageContext, describePageContext } from '../voiceAssistant/pageContext'

function location(pathname: string, search = ''): Location {
  return {
    pathname,
    search,
    hash: '',
    state: null,
    key: 'k',
    unstable_mask: undefined,
  }
}

describe('buildPageContext', () => {
  it('maps known routes to page labels and intents', () => {
    const pages: Array<{ path: string; label: string; hasWorkflow: boolean }> = [
      { path: '/', label: 'Landing', hasWorkflow: false },
      { path: '/builder', label: 'Builder', hasWorkflow: true },
      { path: '/market', label: 'Market', hasWorkflow: true },
      { path: '/dashboard', label: 'Dashboard', hasWorkflow: true },
      { path: '/settings', label: 'Settings', hasWorkflow: false },
    ]

    for (const page of pages) {
      const ctx = buildPageContext(location(page.path), true)
      expect(ctx.pageLabel).toBe(page.label)
      expect(ctx.availableIntents).toContain('navigation')
      if (page.hasWorkflow) {
        expect(ctx.availableIntents).toContain('workflow')
      }
    }
  })

  it('parses settings section from query string', () => {
    const ctx = buildPageContext(location('/settings', '?section=risk'), false)
    expect(ctx.settingsSection).toBe('risk')
    expect(ctx.walletConnected).toBe(false)
  })

  it('maps legacy settings section aliases', () => {
    const ctx = buildPageContext(location('/settings', '?section=guardian'), true)
    expect(ctx.settingsSection).toBe('agents')
  })
})

describe('describePageContext', () => {
  it('includes settings section in description', () => {
    const ctx = buildPageContext(location('/settings', '?section=telegram'), true)
    expect(describePageContext(ctx)).toContain('telegram')
  })
})
