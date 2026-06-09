import { useEffect, useRef } from 'react'
import {
  registerShellState,
  unregisterShellState,
  type VoiceShellState,
} from '../../services/voiceAssistant/componentRegistry'

/**
 * Registers global shell state (wallet, navbar) for voice queries across pages.
 */
export function useVoiceShellState(state: Omit<VoiceShellState, 'updatedAt'>): void {
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    registerShellState(stateRef.current)
    return () => unregisterShellState()
  }, [])

  useEffect(() => {
    registerShellState(state)
  }, [
    state.walletConnected,
    state.walletAddress,
    state.walletSummary,
    state.balances,
  ])
}
