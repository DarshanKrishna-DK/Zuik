import type { VoiceContextManager } from './contextManager'
import type { VoiceSuggestion } from './suggestionEngine'
import { formatSuggestionsForSpeech } from './suggestionEngine'

const STORAGE_KEY = 'zuik_voice_user_prefs'

export type PersonalityTone = 'friendly' | 'concise' | 'detailed'
export type UserExperienceLevel = 'new' | 'returning' | 'power'
export type ResponseKind =
  | 'success'
  | 'clarification'
  | 'error'
  | 'unknown'
  | 'greeting'
  | 'empty_input'
  | 'proactive'
  | 'recovery'

export type ErrorRecoveryType = 'stt' | 'processing' | 'network' | 'microphone' | 'unknown'

export interface UserVoicePreferences {
  tone: PersonalityTone
  visitCount: number
  lastVisitAt: number
  sessionCount: number
  pageVisits: Record<string, number>
  intentCounts: Record<string, number>
  successfulCommands: number
  failedCommands: number
  consecutiveFailures: number
  preferredGreetingIndex: number
}

export interface PersonalityContext {
  pathname?: string
  pageLabel?: string
  walletConnected?: boolean
  responseKind?: ResponseKind
  errorType?: ErrorRecoveryType
  clarificationAttempt?: number
  consecutiveEmptyInputs?: number
  fromWakeWord?: boolean
}

const DEFAULT_PREFERENCES: UserVoicePreferences = {
  tone: 'friendly',
  visitCount: 0,
  lastVisitAt: 0,
  sessionCount: 0,
  pageVisits: {},
  intentCounts: {},
  successfulCommands: 0,
  failedCommands: 0,
  consecutiveFailures: 0,
  preferredGreetingIndex: 0,
}

const GREETINGS_NEW = [
  'Hey there. What would you like to do on ZUIK?',
  'Hi. I am ready to help with workflows, settings, or navigation.',
  'Hello. Tell me what you need and I will take care of it.',
]

const GREETINGS_RETURNING = [
  'Welcome back. What should we tackle?',
  'Good to see you again. Where would you like to go?',
  'Hey. Ready when you are.',
]

const GREETINGS_POWER = [
  'Ready.',
  'What is next?',
  'Go ahead.',
]

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

export function loadUserPreferences(): UserVoicePreferences {
  if (!isBrowser()) return { ...DEFAULT_PREFERENCES }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    const parsed = JSON.parse(raw) as Partial<UserVoicePreferences>
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function saveUserPreferences(prefs: UserVoicePreferences): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore quota errors
  }
}

export class ConversationMemory {
  private prefs: UserVoicePreferences

  constructor(initial?: UserVoicePreferences) {
    this.prefs = initial ?? loadUserPreferences()
  }

  getPreferences(): UserVoicePreferences {
    return { ...this.prefs }
  }

  startSession(): void {
    const now = Date.now()
    const dayMs = 86_400_000
    const isNewDay = now - this.prefs.lastVisitAt > dayMs
    this.prefs = {
      ...this.prefs,
      visitCount: this.prefs.visitCount + 1,
      sessionCount: this.prefs.sessionCount + 1,
      lastVisitAt: now,
      preferredGreetingIndex: isNewDay
        ? 0
        : (this.prefs.preferredGreetingIndex + 1) % GREETINGS_RETURNING.length,
    }
    saveUserPreferences(this.prefs)
  }

  recordPageVisit(pathname: string): void {
    if (!pathname) return
    const count = (this.prefs.pageVisits[pathname] ?? 0) + 1
    this.prefs = {
      ...this.prefs,
      pageVisits: { ...this.prefs.pageVisits, [pathname]: count },
    }
    saveUserPreferences(this.prefs)
  }

  recordIntent(intent: string): void {
    if (!intent) return
    const count = (this.prefs.intentCounts[intent] ?? 0) + 1
    this.prefs = {
      ...this.prefs,
      intentCounts: { ...this.prefs.intentCounts, [intent]: count },
    }
    saveUserPreferences(this.prefs)
  }

  recordSuccess(intent?: string): void {
    this.prefs = {
      ...this.prefs,
      successfulCommands: this.prefs.successfulCommands + 1,
      consecutiveFailures: 0,
    }
    if (intent) this.recordIntent(intent)
    saveUserPreferences(this.prefs)
  }

  recordFailure(): void {
    this.prefs = {
      ...this.prefs,
      failedCommands: this.prefs.failedCommands + 1,
      consecutiveFailures: this.prefs.consecutiveFailures + 1,
    }
    saveUserPreferences(this.prefs)
  }

  getExperienceLevel(): UserExperienceLevel {
    const total = this.prefs.successfulCommands + this.prefs.sessionCount
    if (this.prefs.sessionCount <= 2 || total < 5) return 'new'
    if (this.prefs.successfulCommands >= 25 || this.prefs.sessionCount >= 10) return 'power'
    return 'returning'
  }

  shouldOfferProactiveHelp(): boolean {
    return this.prefs.consecutiveFailures >= 2
  }

  adaptTone(): PersonalityTone {
    const level = this.getExperienceLevel()
    if (level === 'power') return 'concise'
    if (level === 'new') return 'detailed'
    return 'friendly'
  }
}

export class PersonalityEngine {
  private memory: ConversationMemory
  private contextManager: VoiceContextManager | null

  constructor(options: { contextManager?: VoiceContextManager; memory?: ConversationMemory } = {}) {
    this.memory = options.memory ?? new ConversationMemory()
    this.contextManager = options.contextManager ?? null
  }

  getMemory(): ConversationMemory {
    return this.memory
  }

  beginSession(): void {
    this.memory.startSession()
    const ctx = this.resolvePlatformContext()
    if (ctx.pathname) {
      this.memory.recordPageVisit(ctx.pathname)
    }
  }

  recordSuccess(intent?: string): void {
    this.memory.recordSuccess(intent)
  }

  recordFailure(): void {
    this.memory.recordFailure()
  }

  getGreeting(context: PersonalityContext = {}): string {
    const level = this.memory.getExperienceLevel()
    const pool =
      level === 'power'
        ? GREETINGS_POWER
        : level === 'new'
          ? GREETINGS_NEW
          : GREETINGS_RETURNING
    const prefs = this.memory.getPreferences()
    const index = prefs.preferredGreetingIndex % pool.length
    let greeting = pool[index] ?? pool[0]

    const pageLabel = context.pageLabel ?? this.resolvePlatformContext().pageLabel
    if (level === 'returning' && pageLabel && context.fromWakeWord) {
      greeting = `${greeting} You are on ${pageLabel}.`
    }

    return greeting
  }

  personalizeResponse(raw: string, kind: ResponseKind, context: PersonalityContext = {}): string {
    const trimmed = raw.trim()
    if (!trimmed) return trimmed

    const tone = this.memory.adaptTone()

    switch (kind) {
      case 'success':
        return this.formatSuccess(trimmed, tone, context)
      case 'clarification':
        return this.formatClarification(trimmed, context.clarificationAttempt ?? 0, tone)
      case 'error':
      case 'recovery':
        return this.formatErrorRecovery(trimmed, context.errorType ?? 'unknown', tone)
      case 'unknown':
        return trimmed
      case 'greeting':
      case 'empty_input':
      case 'proactive':
      default:
        return trimmed
    }
  }

  formatEmptyInputPrompt(consecutiveEmpty = 0): string {
    if (consecutiveEmpty >= 2) {
      return 'I have not heard anything yet. Tap End session or say a command like open builder.'
    }
    if (consecutiveEmpty === 1) {
      return 'Still listening. Say a command or ask a question whenever you are ready.'
    }
    return 'I did not catch that. Go ahead when you are ready.'
  }

  formatUnknownCommand(suggestions: VoiceSuggestion[]): string {
    const level = this.memory.getExperienceLevel()
    const hint = formatSuggestionsForSpeech(suggestions)
    if (level === 'power') {
      return `Not sure about that. ${hint}`
    }
    if (this.memory.shouldOfferProactiveHelp()) {
      return `I could not match that command. ${hint} Or say help for a quick overview.`
    }
    return `I am not sure how to do that yet. ${hint}`
  }

  formatClarificationQuestion(question: string, attempt = 0): string {
    return this.formatClarification(question, attempt, this.memory.adaptTone())
  }

  formatSessionEnd(): string {
    const level = this.memory.getExperienceLevel()
    if (level === 'power') return 'Session ended.'
    return 'Okay, I will be here when you need me. Say Hey Zuik anytime.'
  }

  formatProactiveNudge(suggestion: VoiceSuggestion): string {
    const phrase = suggestion.phrase.trim()
    if (phrase.endsWith('?')) return phrase
    return `${phrase}?`
  }

  private formatSuccess(text: string, tone: PersonalityTone, context: PersonalityContext): string {
    if (tone === 'concise') {
      return text.replace(/\b(I added|I opened|I updated|Done\.)\b/gi, (m) => m).trim()
    }
    if (tone === 'detailed' && context.pageLabel && !text.toLowerCase().includes(context.pageLabel.toLowerCase())) {
      if (text.length < 80 && !text.endsWith('.')) {
        return `${text}.`
      }
    }
    return text
  }

  private formatClarification(question: string, attempt: number, tone: PersonalityTone): string {
    const q = question.trim()
    if (attempt === 0) {
      if (tone === 'concise') return q
      if (tone === 'detailed') {
        if (q.endsWith('?') || q.endsWith('.')) return `Quick question - ${q}`
        return `Quick question - ${q}?`
      }
      return q
    }
    if (attempt >= 1) {
      return `One more detail would help. ${q}`
    }
    return q
  }

  private formatErrorRecovery(
    message: string,
    errorType: ErrorRecoveryType,
    tone: PersonalityTone,
  ): string {
    const templates: Record<ErrorRecoveryType, string[]> = {
      stt: [
        'I did not catch that clearly. Try speaking a bit closer to the mic.',
        'Sorry, I missed that. Could you repeat it?',
      ],
      processing: [
        'Something went wrong while handling that. Let us try again.',
        'I hit a snag processing your request. Please try once more.',
      ],
      network: [
        'I am having trouble reaching the AI service. Check your connection and try again.',
        'Network issue on my side. Give it another shot in a moment.',
      ],
      microphone: [
        'I need microphone access to listen. Check your browser permissions.',
        'Microphone access is blocked. Enable it in your browser settings.',
      ],
      unknown: [
        'Something unexpected happened. Let us try that again.',
        message || 'An error occurred. Please try again.',
      ],
    }

    const pool = templates[errorType] ?? templates.unknown
    const idx = this.memory.getPreferences().consecutiveFailures % pool.length
    const base = pool[idx] ?? pool[0]

    if (tone === 'concise') {
      return base.split('.')[0] + '.'
    }
    return base
  }

  classifyError(message: string): ErrorRecoveryType {
    const lower = message.toLowerCase()
    if (lower.includes('microphone') || lower.includes('permission')) return 'microphone'
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
      return 'network'
    }
    if (lower.includes('speech') || lower.includes('did not catch') || lower.includes('no speech')) {
      return 'stt'
    }
    if (lower.includes('process') || lower.includes('command')) return 'processing'
    return 'unknown'
  }

  private resolvePlatformContext(): { pathname?: string; pageLabel?: string; walletConnected?: boolean } {
    if (!this.contextManager) return {}
    const page = this.contextManager.getPageContext()
    return {
      pathname: page.pathname,
      pageLabel: page.pageLabel,
      walletConnected: page.walletConnected,
    }
  }
}

export function createPersonalityEngine(
  contextManager?: VoiceContextManager,
  memory?: ConversationMemory,
): PersonalityEngine {
  return new PersonalityEngine({ contextManager, memory })
}
