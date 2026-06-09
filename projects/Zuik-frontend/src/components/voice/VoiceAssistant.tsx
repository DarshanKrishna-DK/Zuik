import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ConversationManager,
  type VoiceAssistantMessage,
  type VoiceAssistantState,
} from '../../services/voiceAssistant'
import { VoiceAssistantUI } from './VoiceAssistantUI'
import TransactionApproval from './TransactionApproval'
import { useVoicePlatform } from './VoicePlatformContext'
import './VoiceAssistant.css'

export interface VoiceAssistantProps {
  /** When false, the assistant stays mounted but does not listen. */
  enabled?: boolean
  /** Override default command processor (e.g. for tests). */
  processCommand?: (text: string) => Promise<string>
  /** Start with panel expanded. */
  defaultExpanded?: boolean
}

const DEFAULT_HEALTH = { available: false, groq: false, elevenlabs: false }

export default function VoiceAssistant({
  enabled = true,
  processCommand: processCommandOverride,
  defaultExpanded = false,
}: VoiceAssistantProps) {
  const { processCommand: platformProcessCommand, suggestions, proactiveSuggestion, openWalletModal, personalityEngine } =
    useVoicePlatform()

  const managerRef = useRef<ConversationManager | null>(null)
  const processCommandRef = useRef(processCommandOverride ?? platformProcessCommand)
  const [state, setState] = useState<VoiceAssistantState>('idle')
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true)
  const [messages, setMessages] = useState<VoiceAssistantMessage[]>([])
  const [interimTranscript, setInterimTranscript] = useState('')
  const [serviceHealth, setServiceHealth] = useState(DEFAULT_HEALTH)

  processCommandRef.current = processCommandOverride ?? platformProcessCommand

  const syncFromManager = useCallback(() => {
    const snapshot = managerRef.current?.getSnapshot()
    if (!snapshot) return
    setState(snapshot.state)
    setMessages(snapshot.messages)
    setInterimTranscript(snapshot.interimTranscript)
    setWakeWordEnabled(snapshot.wakeWordEnabled)
    setServiceHealth(snapshot.serviceHealth)
  }, [])

  const personalityRef = useRef(personalityEngine)
  personalityRef.current = personalityEngine

  useEffect(() => {
    console.log('[VoiceAssistant] Initializing conversation manager, enabled:', enabled)
    
    const manager = new ConversationManager({
      processCommand: (text) => processCommandRef.current(text),
      personalityEngine: personalityRef.current,
      onStateChange: (nextState) => {
        console.log('[VoiceAssistant] State change:', nextState)
        setState(nextState)
        syncFromManager()
      },
      onMessage: () => {
        syncFromManager()
      },
      onInterimTranscript: (text) => {
        setInterimTranscript(text)
      },
      onError: (error) => {
        console.error('[VoiceAssistant] Error:', error)
        setMessages((prev) => [
          ...prev.slice(-19),
          {
            id: `va-err-${Date.now()}`,
            role: 'system',
            text: error,
            timestamp: Date.now(),
          },
        ])
      },
      onWakeWordDetected: () => {
        console.log('[VoiceAssistant] Wake word detected callback')
      },
    })

    managerRef.current = manager

    if (enabled) {
      console.log('[VoiceAssistant] Starting manager...')
      void manager.start().then(() => {
        console.log('[VoiceAssistant] Manager started successfully')
        syncFromManager()
      }).catch((error) => {
        console.error('[VoiceAssistant] Failed to start manager:', error)
      })
    }

    return () => {
      console.log('[VoiceAssistant] Cleaning up manager')
      manager.stop()
      managerRef.current = null
    }
  }, [enabled, syncFromManager])

  const handleToggleExpanded = useCallback(() => {
    setExpanded((value) => !value)
  }, [])

  const handleActivate = useCallback(() => {
    void managerRef.current?.activateManually()
  }, [])

  const handleEndSession = useCallback(() => {
    void managerRef.current?.endConversation()
  }, [])

  const handleToggleWakeWord = useCallback(() => {
    const manager = managerRef.current
    if (!manager) return
    const next = !wakeWordEnabled
    manager.setWakeWordEnabled(next)
    setWakeWordEnabled(next)
    syncFromManager()
  }, [syncFromManager, wakeWordEnabled])

  return (
    <VoiceAssistantUI
      state={state}
      expanded={expanded}
      wakeWordEnabled={wakeWordEnabled}
      messages={messages}
      interimTranscript={interimTranscript}
      serviceHealth={serviceHealth}
      suggestions={suggestions}
      proactiveSuggestion={proactiveSuggestion}
      onToggleExpanded={handleToggleExpanded}
      onActivate={handleActivate}
      onEndSession={handleEndSession}
      onToggleWakeWord={handleToggleWakeWord}
      transactionPanel={
        <TransactionApproval
          openWalletModal={openWalletModal}
          onRequestExpand={() => setExpanded(true)}
        />
      }
    />
  )
}
