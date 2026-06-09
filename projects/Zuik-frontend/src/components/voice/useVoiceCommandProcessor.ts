import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import {
  createContextManager,
  createUnifiedCommandHandler,
  type VoiceContextManager,
  type VoiceSuggestion,
} from '../../services/voiceAssistant'

export interface UseVoiceCommandProcessorOptions {
  openWalletModal?: () => void
}

export function useVoiceCommandProcessor(options: UseVoiceCommandProcessorOptions = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeAddress } = useWallet()
  const openWalletModalRef = useRef(options.openWalletModal)
  openWalletModalRef.current = options.openWalletModal

  const [suggestions, setSuggestions] = useState<VoiceSuggestion[]>([])

  const contextManager = useMemo<VoiceContextManager>(
    () =>
      createContextManager({
        navigate,
        location,
        activeAddress: activeAddress ?? null,
        openWalletModal: () => openWalletModalRef.current?.(),
      }),
    [navigate, location, activeAddress],
  )

  const unifiedHandler = useMemo(
    () =>
      createUnifiedCommandHandler(contextManager, {
        onSuggestionsUpdated: setSuggestions,
      }),
    [contextManager],
  )

  useEffect(() => {
    contextManager.updateLocation(location)
    setSuggestions(unifiedHandler.getSuggestions())
  }, [contextManager, location, unifiedHandler])

  useEffect(() => {
    contextManager.updateWalletAddress(activeAddress ?? null)
    setSuggestions(unifiedHandler.getSuggestions())
  }, [contextManager, activeAddress, unifiedHandler])

  const processCommand = unifiedHandler.process
  const proactiveSuggestion = unifiedHandler.getProactiveSuggestion()

  return {
    processCommand,
    contextManager,
    suggestions,
    proactiveSuggestion,
    classifyCommand: unifiedHandler.classify,
  }
}
