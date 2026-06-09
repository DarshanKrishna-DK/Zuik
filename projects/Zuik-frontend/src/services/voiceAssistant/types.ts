import type { PersonalityEngine } from './personalityEngine'

export type VoiceAssistantState =
  | 'idle'
  | 'wake_listening'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'
  | 'unavailable'

export type ConversationPhase = 'wake' | 'active' | 'paused'

export interface VoiceAssistantMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: number
}

export interface VoicePipelineConfig {
  language?: string
  voiceId?: string
  silenceTimeoutMs?: number
  minRecordingMs?: number
  maxRecordingMs?: number
}

export interface WakeWordConfig {
  phrase?: string
  aliases?: string[]
  sensitivity?: number
  lang?: string
}

export interface ConversationManagerConfig {
  conversationTimeoutMs?: number
  greetingText?: string
  voicePipeline?: VoicePipelineConfig
  wakeWord?: WakeWordConfig
  personalityEngine?: PersonalityEngine
  onStateChange?: (state: VoiceAssistantState) => void
  onMessage?: (message: VoiceAssistantMessage) => void
  onInterimTranscript?: (text: string) => void
  onError?: (error: string) => void
  onWakeWordDetected?: () => void
  processCommand?: (text: string) => Promise<string>
}

export interface VoiceAssistantSnapshot {
  state: VoiceAssistantState
  phase: ConversationPhase
  expanded: boolean
  wakeWordEnabled: boolean
  messages: VoiceAssistantMessage[]
  interimTranscript: string
  serviceHealth: {
    available: boolean
    groq: boolean
    elevenlabs: boolean
  }
}
