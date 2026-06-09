import { createVoicePipeline, type VoicePipeline } from './voicePipeline'
import { createWakeWordDetector, isWakeWordSupported, type WakeWordDetector } from './wakeWordDetection'
import { createPersonalityEngine, type PersonalityEngine } from './personalityEngine'
import type {
  ConversationManagerConfig,
  ConversationPhase,
  VoiceAssistantMessage,
  VoiceAssistantState,
} from './types'

const DEFAULT_CONVERSATION_TIMEOUT_MS = 30_000

let messageCounter = 0

function nextMessageId(): string {
  messageCounter += 1
  return `va-msg-${Date.now()}-${messageCounter}`
}

function defaultProcessCommand(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) {
    return Promise.resolve('I did not catch that. Try again.')
  }
  return Promise.resolve(
    `I heard "${trimmed}". Platform command execution is coming in the next update.`,
  )
}

export class ConversationManager {
  private readonly config: Required<
    Pick<ConversationManagerConfig, 'conversationTimeoutMs' | 'greetingText'>
  > & ConversationManagerConfig

  private pipeline: VoicePipeline
  private wakeDetector: WakeWordDetector | null = null
  private state: VoiceAssistantState = 'idle'
  private phase: ConversationPhase = 'wake'
  private messages: VoiceAssistantMessage[] = []
  private interimTranscript = ''
  private wakeWordEnabled = true
  private started = false
  private conversationTimer: ReturnType<typeof setTimeout> | null = null
  private conversationDeadline = 0
  private abortController: AbortController | null = null
  private serviceHealth = { available: false, groq: false, elevenlabs: false }
  private personality: PersonalityEngine
  private consecutiveEmptyInputs = 0
  private sessionStarted = false

  constructor(config: ConversationManagerConfig = {}) {
    this.config = {
      conversationTimeoutMs: config.conversationTimeoutMs ?? DEFAULT_CONVERSATION_TIMEOUT_MS,
      greetingText: config.greetingText ?? '',
      ...config,
    }

    // Optimize voice pipeline for better performance
    const optimizedPipelineConfig = {
      silenceTimeoutMs: 4000,  // 4 seconds of silence before stopping
      minRecordingMs: 300,     // Minimum recording time
      maxRecordingMs: 30000,   // Allow up to 30 seconds of recording
      language: 'en',          // Explicit language for better recognition
      ...config.voicePipeline,
    }

    this.pipeline = createVoicePipeline(optimizedPipelineConfig)
    this.personality = config.personalityEngine ?? createPersonalityEngine()
  }

  getSnapshot() {
    return {
      state: this.state,
      phase: this.phase,
      messages: [...this.messages],
      interimTranscript: this.interimTranscript,
      wakeWordEnabled: this.wakeWordEnabled,
      serviceHealth: { ...this.serviceHealth },
    }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    try {
      this.serviceHealth = await this.pipeline.checkHealth()
    } catch {
      this.serviceHealth = { available: false, groq: false, elevenlabs: false }
    }

    const micOk = await this.ensureMicrophoneAccess()
    if (!micOk) {
      this.setState('unavailable')
      this.config.onError?.('Microphone access is required for the voice assistant.')
      return
    }

    console.log('[ConversationManager] Wake word enabled:', this.wakeWordEnabled, 'supported:', isWakeWordSupported())
    if (this.wakeWordEnabled && isWakeWordSupported()) {
      this.startWakeWordDetection()
      this.setState('wake_listening')
      console.log('[ConversationManager] Wake word detection started, state: wake_listening')
    } else if (this.wakeWordEnabled) {
      console.log('[ConversationManager] Wake word not supported in browser')
      this.setState('idle')
      this.pushSystemMessage('Wake word is unavailable. Tap the assistant to speak.')
    } else {
      console.log('[ConversationManager] Wake word disabled')
      this.setState('idle')
    }
  }

  stop(): void {
    this.started = false
    this.clearConversationTimer()
    this.abortActiveWork()
    this.wakeDetector?.destroy()
    this.wakeDetector = null
    this.pipeline.destroy()
    this.pipeline = createVoicePipeline(this.config.voicePipeline)
    this.phase = 'wake'
    this.interimTranscript = ''
    this.setState('idle')
  }

  setWakeWordEnabled(enabled: boolean): void {
    this.wakeWordEnabled = enabled
    if (!this.started) return

    if (enabled && this.phase === 'wake') {
      this.startWakeWordDetection()
      this.setState('wake_listening')
    } else {
      this.wakeDetector?.stop()
      if (this.phase === 'wake' && this.state !== 'unavailable') {
        this.setState('idle')
      }
    }
  }

  async activateManually(): Promise<void> {
    if (!this.started) {
      await this.start()
    }
    if (this.state === 'unavailable') return

    this.wakeDetector?.pause()
    await this.enterActiveConversation(false)
  }

  async endConversation(): Promise<void> {
    this.clearConversationTimer()
    this.conversationDeadline = 0
    this.abortActiveWork()
    this.phase = 'wake'
    this.interimTranscript = ''

    if (this.wakeWordEnabled && isWakeWordSupported()) {
      this.wakeDetector?.resume()
      this.setState('wake_listening')
    } else {
      this.setState('idle')
    }
  }

  private async ensureMicrophoneAccess(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch {
      return false
    }
  }

  private startWakeWordDetection(): void {
    console.log('[ConversationManager] Starting wake word detection')
    this.wakeDetector?.destroy()
    this.wakeDetector = createWakeWordDetector({
      config: this.config.wakeWord,
      onWakeWord: (transcript) => {
        console.log('[ConversationManager] Wake word detected:', transcript)
        void this.onWakeWordDetected()
      },
      onError: (message) => {
        console.log('[ConversationManager] Wake word error:', message)
        this.config.onError?.(message)
      },
      onStatusChange: (listening) => {
        console.log('[ConversationManager] Wake word listening:', listening)
      },
    })
    this.wakeDetector.start()
  }

  private async onWakeWordDetected(): Promise<void> {
    if (this.phase === 'active') return
    this.config.onWakeWordDetected?.()
    this.wakeDetector?.pause()
    await this.enterActiveConversation(true)
  }

  private async enterActiveConversation(fromWakeWord: boolean): Promise<void> {
    this.phase = 'active'
    this.clearConversationTimer()
    this.abortActiveWork()
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    this.consecutiveEmptyInputs = 0

    if (!this.sessionStarted) {
      this.personality.beginSession()
      this.sessionStarted = true
    }

    const greeting =
      this.config.greetingText?.trim() ||
      this.personality.getGreeting({ fromWakeWord })

    if (fromWakeWord && this.serviceHealth.elevenlabs) {
      try {
        this.setState('speaking')
        await this.pipeline.speak(greeting, signal)
        this.pushAssistantMessage(greeting)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          this.config.onError?.('Unable to play greeting audio.')
        }
      }
    } else if (fromWakeWord) {
      this.pushAssistantMessage(greeting)
    }

    await this.listenForCommand()
  }

  private isConversationExpired(): boolean {
    return this.conversationDeadline > 0 && Date.now() >= this.conversationDeadline
  }

  private async listenForCommand(): Promise<void> {
    if (!this.started || this.phase !== 'active') return
    if (this.isConversationExpired()) {
      await this.endConversation()
      return
    }

    console.log('[ConversationManager] Starting to listen for command')
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    this.interimTranscript = ''
    this.setState('listening')

    try {
      const result = await this.pipeline.captureSpeech({
        signal,
        onInterim: (text) => {
          this.interimTranscript = text
          this.config.onInterimTranscript?.(text)
          this.config.onStateChange?.(this.state)
          console.log('[ConversationManager] Interim transcript:', text)
        },
      })

      this.interimTranscript = ''
      if (!result.text.trim()) {
        await this.handleEmptyInput()
        return
      }

      this.consecutiveEmptyInputs = 0
      this.pushUserMessage(result.text)
      await this.processAndRespond(result.text, signal)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      const message = error instanceof Error ? error.message : 'Voice capture failed'
      if (message.includes('No speech detected')) {
        if (this.isConversationExpired()) {
          await this.endConversationWithFarewell()
          return
        }
        await this.handleEmptyInput()
        return
      }
      this.config.onError?.(message)
      this.setState('error')
      const recovery = this.personality.personalizeResponse(message, 'error', {
        errorType: this.personality.classifyError(message),
      })
      this.pushAssistantMessage(recovery)
      if (this.serviceHealth.elevenlabs) {
        try {
          this.setState('speaking')
          await this.pipeline.speak(recovery, this.abortController?.signal)
        } catch {
          // Ignore TTS errors during recovery
        }
      }
      this.scheduleReturnToWake()
    }
  }

  private async processAndRespond(text: string, signal: AbortSignal): Promise<void> {
    this.setState('processing')

    try {
      const processor = this.config.processCommand ?? defaultProcessCommand
      const response = await processor(text)
      this.pushAssistantMessage(response)

      if (this.serviceHealth.elevenlabs && response.trim()) {
        this.setState('speaking')
        await this.pipeline.speak(response, signal)
      }

      this.scheduleFollowUpListening()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'Failed to process command'
      this.config.onError?.(message)
      this.setState('error')
      const recovery = this.personality.personalizeResponse(message, 'error', {
        errorType: this.personality.classifyError(message),
      })
      this.pushAssistantMessage(recovery)
      this.scheduleReturnToWake()
    }
  }

  private async handleEmptyInput(): Promise<void> {
    if (this.isConversationExpired()) {
      await this.endConversationWithFarewell()
      return
    }

    this.consecutiveEmptyInputs += 1
    const prompt = this.personality.formatEmptyInputPrompt(this.consecutiveEmptyInputs)

    if (this.consecutiveEmptyInputs >= 2 && this.serviceHealth.elevenlabs) {
      this.pushAssistantMessage(prompt)
      try {
        this.setState('speaking')
        await this.pipeline.speak(prompt, this.abortController?.signal)
      } catch {
        // Continue listening even if TTS fails
      }
    }

    this.setState('listening')
    void this.listenForCommand()
  }

  private scheduleFollowUpListening(): void {
    console.log('[ConversationManager] Scheduling follow-up listening with 30s timeout')
    this.clearConversationTimer()
    this.conversationDeadline = Date.now() + this.config.conversationTimeoutMs
    this.interimTranscript = ''
    this.consecutiveEmptyInputs = 0
    this.setState('listening')

    const remainingMs = Math.max(0, this.conversationDeadline - Date.now())
    console.log('[ConversationManager] Setting conversation timeout for', remainingMs, 'ms')
    this.conversationTimer = setTimeout(() => {
      this.conversationTimer = null
      console.log('[ConversationManager] Conversation timeout reached, ending with farewell')
      void this.endConversationWithFarewell()
    }, remainingMs)

    void this.listenForCommand()
  }

  private async endConversationWithFarewell(): Promise<void> {
    if (this.phase === 'active' && this.serviceHealth.elevenlabs) {
      const farewell = this.personality.formatSessionEnd()
      this.pushAssistantMessage(farewell)
      try {
        this.setState('speaking')
        await this.pipeline.speak(farewell, this.abortController?.signal)
      } catch {
        // Proceed to end session
      }
    }
    await this.endConversation()
  }

  private scheduleReturnToWake(): void {
    this.clearConversationTimer()
    this.conversationTimer = setTimeout(() => {
      this.conversationTimer = null
      void this.endConversation()
    }, 4000)
  }

  private clearConversationTimer(): void {
    if (this.conversationTimer) {
      clearTimeout(this.conversationTimer)
      this.conversationTimer = null
    }
  }

  private abortActiveWork(): void {
    this.abortController?.abort()
    this.abortController = null
    this.pipeline.stopSpeaking()
    this.pipeline.stopCapture()
  }

  private pushUserMessage(text: string): void {
    this.pushMessage({ role: 'user', text })
  }

  private pushAssistantMessage(text: string): void {
    this.pushMessage({ role: 'assistant', text })
  }

  private pushSystemMessage(text: string): void {
    this.pushMessage({ role: 'system', text })
  }

  private pushMessage(partial: Pick<VoiceAssistantMessage, 'role' | 'text'>): void {
    const message: VoiceAssistantMessage = {
      id: nextMessageId(),
      role: partial.role,
      text: partial.text,
      timestamp: Date.now(),
    }
    this.messages = [...this.messages.slice(-19), message]
    this.config.onMessage?.(message)
  }

  private setState(state: VoiceAssistantState): void {
    if (this.state === state) return
    this.state = state
    this.config.onStateChange?.(state)
  }
}

export function createConversationManager(config?: ConversationManagerConfig): ConversationManager {
  return new ConversationManager(config)
}
