import { describe, expect, it, vi } from 'vitest'
import type { Location, NavigateFunction } from 'react-router-dom'
import { createContextManager } from '../voiceAssistant/contextManager'
import { createCommandProcessor } from '../voiceAssistant/commandProcessor'

function createTestContextManager(overrides: {
  navigate?: NavigateFunction
  pathname?: string
  activeAddress?: string | null
} = {}) {
  const navigate = overrides.navigate ?? vi.fn()
  const location: Location = {
    pathname: overrides.pathname ?? '/',
    search: '',
    hash: '',
    state: null,
    key: 'default',
    unstable_mask: undefined,
  }

  return {
    navigate,
    manager: createContextManager({
      navigate,
      location,
      activeAddress: overrides.activeAddress ?? null,
    }),
  }
}

describe('createCommandProcessor', () => {
  it('navigates to builder for open builder command', async () => {
    const { navigate, manager } = createTestContextManager()
    const processor = createCommandProcessor(manager)

    const response = await processor.process('Open the builder')

    expect(navigate).toHaveBeenCalledWith('/builder')
    expect(response.toLowerCase()).toContain('builder')
  })

  it('opens wallet modal hook when connect wallet is requested', async () => {
    const openWalletModal = vi.fn()
    const navigate = vi.fn()
    const location: Location = {
      pathname: '/market',
      search: '',
      hash: '',
      state: null,
      key: 'default',
      unstable_mask: undefined,
    }
    const manager = createContextManager({
      navigate,
      location,
      activeAddress: null,
      openWalletModal,
    })
    const processor = createCommandProcessor(manager)

    const response = await processor.process('Connect my wallet')

    expect(openWalletModal).toHaveBeenCalled()
    expect(response.toLowerCase()).toContain('wallet')
  })

  it('suggests alternatives for unknown commands', async () => {
    const { manager } = createTestContextManager()
    const processor = createCommandProcessor(manager)

    const response = await processor.process('Do something impossible please')

    expect(response.toLowerCase()).toContain('try')
  })
})
