import type { Location, NavigateFunction } from 'react-router-dom'
import type { ActionContext } from './commandTypes'
import { describeRegisteredContext } from './componentRegistry'
import { buildPageContext, describePageContext } from './pageContext'

export interface VoiceContextManager {
  getActionContext: () => ActionContext
  getPageContext: () => ReturnType<typeof buildPageContext>
  describeCurrentPage: () => string
  updateLocation: (location: Location) => void
  updateWalletAddress: (address: string | null) => void
}

export interface CreateContextManagerOptions {
  navigate: NavigateFunction
  location: Location
  activeAddress: string | null
  openWalletModal?: () => void
}

export function createContextManager(options: CreateContextManagerOptions): VoiceContextManager {
  let location = options.location
  let activeAddress = options.activeAddress
  const navigate = options.navigate
  const openWalletModal = options.openWalletModal

  return {
    getActionContext(): ActionContext {
      return {
        navigate,
        location,
        activeAddress,
        openWalletModal,
      }
    },

    getPageContext() {
      return buildPageContext(location, Boolean(activeAddress))
    },

    describeCurrentPage() {
      const base = describePageContext(buildPageContext(location, Boolean(activeAddress)))
      const registered = describeRegisteredContext(location.pathname)
      return registered ? `${base}. ${registered}` : base
    },

    updateLocation(nextLocation: Location) {
      location = nextLocation
    },

    updateWalletAddress(address: string | null) {
      activeAddress = address
    },
  }
}
