import { describe, expect, it, vi } from 'vitest'
import type { Location, NavigateFunction } from 'react-router-dom'
import { executeCommand, formatActionResult } from '../voiceAssistant/actionExecutor'
import { classifyCommand } from '../voiceAssistant/intentClassifier'
import { buildPageContext } from '../voiceAssistant/pageContext'

const VALID_RECIPIENT = 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'

function actionContext(overrides: {
  pathname?: string
  activeAddress?: string | null
  navigate?: NavigateFunction
} = {}) {
  const navigate = overrides.navigate ?? vi.fn()
  const location: Location = {
    pathname: overrides.pathname ?? '/',
    search: '',
    hash: '',
    state: null,
    key: 'k',
    unstable_mask: undefined,
  }
  return {
    navigate,
    location,
    activeAddress: overrides.activeAddress ?? null,
    openWalletModal: vi.fn(),
  }
}

describe('executeCommand navigation', () => {
  const routes = [
    { phrase: 'Go to builder', action: 'go_builder', path: '/builder' },
    { phrase: 'Open market', action: 'go_market', path: '/market' },
    { phrase: 'Show dashboard', action: 'go_dashboard', path: '/dashboard' },
    { phrase: 'Open settings', action: 'go_settings', path: '/settings' },
    { phrase: 'Go home', action: 'go_home', path: '/' },
  ] as const

  for (const route of routes) {
    it(`navigates to ${route.path} for "${route.phrase}"`, async () => {
      const navigate = vi.fn()
      const ctx = actionContext({ navigate })
      const pageContext = buildPageContext(ctx.location, false)
      const parsed = classifyCommand(route.phrase, pageContext)

      expect(parsed.action).toBe(route.action)

      const result = await executeCommand(parsed, ctx)
      expect(navigate).toHaveBeenCalledWith(route.path)
      expect(result.success).toBe(true)
    })
  }
})

describe('formatActionResult', () => {
  it('appends wallet hint when requiresWallet is set', () => {
    const text = formatActionResult({
      success: true,
      message: 'Opening dashboard.',
      requiresWallet: true,
    })
    expect(text.toLowerCase()).toContain('connect')
  })

  it('appends approval panel hint when requiresUserApproval is set', () => {
    const text = formatActionResult({
      success: true,
      message: 'Payment prepared.',
      requiresUserApproval: true,
    })
    expect(text.toLowerCase()).toContain('approval')
  })
})

describe('executeCommand transaction guardrails', () => {
  it('requires wallet for payment preparation', async () => {
    const ctx = actionContext({ activeAddress: null })
    const pageContext = buildPageContext(ctx.location, false)
    const parsed = classifyCommand(`Send 1 algo to ${VALID_RECIPIENT}`, pageContext)

    const result = await executeCommand(parsed, ctx)
    expect(result.success).toBe(false)
    expect(result.requiresWallet).toBe(true)
  })
})
