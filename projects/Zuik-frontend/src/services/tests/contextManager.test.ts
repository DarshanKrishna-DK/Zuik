import { describe, expect, it, vi } from 'vitest'
import type { Location } from 'react-router-dom'
import { createContextManager } from '../voiceAssistant/contextManager'

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

describe('createContextManager', () => {
  it('reflects current page in page context', () => {
    const manager = createContextManager({
      navigate: vi.fn(),
      location: location('/builder'),
      activeAddress: 'OWNER123',
    })

    expect(manager.getPageContext().pathname).toBe('/builder')
    expect(manager.getPageContext().pageLabel).toBe('Builder')
    expect(manager.getPageContext().walletConnected).toBe(true)
  })

  it('preserves wallet address when location updates (cross-page continuity)', () => {
    const manager = createContextManager({
      navigate: vi.fn(),
      location: location('/builder'),
      activeAddress: 'OWNER123',
    })

    manager.updateLocation(location('/settings', '?section=risk'))

    const ctx = manager.getPageContext()
    expect(ctx.pathname).toBe('/settings')
    expect(ctx.settingsSection).toBe('risk')
    expect(ctx.walletConnected).toBe(true)
    expect(manager.getActionContext().activeAddress).toBe('OWNER123')
  })

  it('updates wallet connection state independently of navigation', () => {
    const manager = createContextManager({
      navigate: vi.fn(),
      location: location('/dashboard'),
      activeAddress: null,
    })

    expect(manager.getPageContext().walletConnected).toBe(false)

    manager.updateWalletAddress('NEWADDR')
    expect(manager.getPageContext().walletConnected).toBe(true)
    expect(manager.getActionContext().activeAddress).toBe('NEWADDR')
  })

  it('describes current page with settings section detail', () => {
    const manager = createContextManager({
      navigate: vi.fn(),
      location: location('/settings', '?section=agents'),
      activeAddress: null,
    })

    expect(manager.describeCurrentPage()).toContain('agents')
  })
})
