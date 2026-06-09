import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import {
  createContextManager,
  createPersonalityEngine,
  createUnifiedCommandHandler,
  subscribeVoiceRegistry,
  type PersonalityEngine,
  type VoiceContextManager,
  type VoiceSuggestion,
} from '../../services/voiceAssistant'
import type { ParsedCommand } from '../../services/voiceAssistant/commandTypes'

export interface VoiceSessionState {
  lastPage: string
  lastPageLabel: string
  navigationCount: number
  lastCommandAt: number | null
}

export interface VoicePlatformContextValue {
  processCommand: (text: string) => Promise<string>
  contextManager: VoiceContextManager
  personalityEngine: PersonalityEngine
  suggestions: VoiceSuggestion[]
  proactiveSuggestion: VoiceSuggestion | null
  classifyCommand: (text: string) => ParsedCommand
  session: VoiceSessionState
  describeCurrentContext: () => string
  openWalletModal?: () => void
}

const VoicePlatformContext = createContext<VoicePlatformContextValue | null>(null)

export interface VoicePlatformProviderProps {
  children: ReactNode
  openWalletModal?: () => void
}

export function VoicePlatformProvider({ children, openWalletModal }: VoicePlatformProviderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeAddress } = useWallet()
  const openWalletModalRef = useRef(openWalletModal)
  openWalletModalRef.current = openWalletModal

  const [suggestions, setSuggestions] = useState<VoiceSuggestion[]>([])
  const [session, setSession] = useState<VoiceSessionState>({
    lastPage: location.pathname,
    lastPageLabel: location.pathname,
    navigationCount: 0,
    lastCommandAt: null,
  })

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

  const personalityEngine = useMemo(
    () => createPersonalityEngine(contextManager),
    [contextManager],
  )

  const unifiedHandler = useMemo(
    () =>
      createUnifiedCommandHandler(contextManager, {
        personalityEngine,
        onSuggestionsUpdated: setSuggestions,
      }),
    [contextManager, personalityEngine],
  )

  useEffect(() => {
    contextManager.updateLocation(location)
    personalityEngine.getMemory().recordPageVisit(location.pathname)
    setSuggestions(unifiedHandler.getSuggestions())
    setSession((prev) => ({
      ...prev,
      lastPage: location.pathname,
      lastPageLabel: contextManager.describeCurrentPage(),
      navigationCount: prev.lastPage !== location.pathname ? prev.navigationCount + 1 : prev.navigationCount,
    }))
  }, [contextManager, location, unifiedHandler, personalityEngine])

  useEffect(() => {
    contextManager.updateWalletAddress(activeAddress ?? null)
    setSuggestions(unifiedHandler.getSuggestions())
  }, [contextManager, activeAddress, unifiedHandler])

  useEffect(() => {
    return subscribeVoiceRegistry(() => {
      setSuggestions(unifiedHandler.getSuggestions())
    })
  }, [unifiedHandler])

  const processCommand = useCallback(
    async (text: string) => {
      setSession((prev) => ({ ...prev, lastCommandAt: Date.now() }))
      return unifiedHandler.process(text)
    },
    [unifiedHandler],
  )

  const describeCurrentContext = useCallback(
    () => contextManager.describeCurrentPage(),
    [contextManager],
  )

  const value = useMemo<VoicePlatformContextValue>(
    () => ({
      processCommand,
      contextManager,
      personalityEngine,
      suggestions,
      proactiveSuggestion: unifiedHandler.getProactiveSuggestion(),
      classifyCommand: unifiedHandler.classify,
      session,
      describeCurrentContext,
      openWalletModal,
    }),
    [
      processCommand,
      contextManager,
      personalityEngine,
      suggestions,
      unifiedHandler,
      session,
      describeCurrentContext,
      openWalletModal,
    ],
  )

  return (
    <VoicePlatformContext.Provider value={value}>
      {children}
    </VoicePlatformContext.Provider>
  )
}

export function useVoicePlatform(): VoicePlatformContextValue {
  const ctx = useContext(VoicePlatformContext)
  if (!ctx) {
    throw new Error('useVoicePlatform must be used within VoicePlatformProvider')
  }
  return ctx
}

export function useVoicePlatformOptional(): VoicePlatformContextValue | null {
  return useContext(VoicePlatformContext)
}
