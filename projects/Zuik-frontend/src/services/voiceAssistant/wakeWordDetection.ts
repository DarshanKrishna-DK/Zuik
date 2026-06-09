import type { WakeWordConfig } from './types'

const DEFAULT_PHRASE = 'hey zuik'
const DEFAULT_ALIASES = [
  'hey zuik',
  'hey zuke',
  'hey zoik', 
  'hey zwick',
  'hey zui',
  'hey zwik',
  'hey zook',
  'hey zoo',
  'hey zu',
  'a zuik',
  'hey zeek',
  'hey zeak',
]

export interface WakeWordDetector {
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  isRunning: () => boolean
  destroy: () => void
}

export interface WakeWordDetectorOptions {
  config?: WakeWordConfig
  onWakeWord: (transcript: string) => void
  onError?: (message: string) => void
  onStatusChange?: (listening: boolean) => void
}

function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildWakePatterns(phrase: string, aliases: string[]): RegExp[] {
  const unique = [...new Set([phrase, ...aliases].map(normalizeTranscript).filter(Boolean))]
  return unique.map((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped.replace(/\s+/g, '\\s+')}\\b`, 'i')
  })
}

function matchesWakeWord(transcript: string, patterns: RegExp[], sensitivity: number): boolean {
  const normalized = normalizeTranscript(transcript)
  if (!normalized) return false

  for (const pattern of patterns) {
    if (pattern.test(normalized)) return true
  }

  // Fuzzy fallback: require "hey" + something close to "zuik"
  if (sensitivity >= 0.3 && /\bhey\b/.test(normalized)) {
    // More flexible matching for "zuik" variations
    if (/\bz[uwioea][a-z]{0,3}k?\b/.test(normalized) || 
        /\bzoo?k?\b/.test(normalized) || 
        /\bzu[a-z]{0,2}k?\b/.test(normalized)) {
      console.log('[WakeWord] Fuzzy match success for:', transcript)
      return true
    }
  }

  return false
}

export function transcriptContainsWakeWord(
  transcript: string,
  config?: WakeWordConfig,
): boolean {
  const phrase = config?.phrase ?? DEFAULT_PHRASE
  const aliases = config?.aliases ?? DEFAULT_ALIASES
  const sensitivity = config?.sensitivity ?? 0.6
  const patterns = buildWakePatterns(phrase, aliases)
  return matchesWakeWord(transcript, patterns, sensitivity)
}

export function createWakeWordDetector(options: WakeWordDetectorOptions): WakeWordDetector {
  const lang = options.config?.lang ?? 'en-US'

  let recognition: SpeechRecognition | null = null
  let running = false
  let paused = false
  let destroyed = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  const clearRestartTimer = () => {
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
  }

  const scheduleRestart = (delayMs = 100) => {  // Faster restart for better responsiveness
    clearRestartTimer()
    if (destroyed || paused || !running) return
    restartTimer = setTimeout(() => {
      restartTimer = null
      if (!destroyed && !paused && running) {
        startRecognition()
      }
    }, delayMs)
  }

  const handleTranscript = (transcript: string) => {
    if (paused || !running || destroyed) return
    console.log('[WakeWord] Processing transcript:', transcript)
    if (transcriptContainsWakeWord(transcript, options.config)) {
      console.log('[WakeWord] Wake word detected in:', transcript)
      options.onWakeWord(transcript)
    }
  }

  const startRecognition = () => {
    if (!isSpeechRecognitionSupported() || destroyed || paused || !running) return

    try {
      if (recognition) {
        try {
          recognition.abort()
        } catch {
          /* ignore */
        }
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      recognition = new SR()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.lang = lang

      recognition.onstart = () => {
        options.onStatusChange?.(true)
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let finalText = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const chunk = result[0]?.transcript ?? ''
          if (result.isFinal) {
            finalText += chunk
          } else {
            interim += chunk
          }
        }

        if (finalText) {
          handleTranscript(finalText)
        } else if (interim) {
          handleTranscript(interim)
        }
      }

      recognition.onend = () => {
        options.onStatusChange?.(false)
        if (!destroyed && running && !paused) {
          scheduleRestart()
        }
      }

      recognition.onerror = (event) => {
        console.log('[WakeWord] Recognition error:', event.error || 'unknown')
        options.onStatusChange?.(false)
        if (!destroyed && running && !paused) {
          // Different restart delays based on error type
          const delay = event.error === 'network' ? 1000 : 200
          scheduleRestart(delay)
        }
      }

      recognition.start()
    } catch (error) {
      options.onError?.(
        error instanceof Error ? error.message : 'Wake word detection failed to start',
      )
      options.onStatusChange?.(false)
    }
  }

  return {
    start() {
      if (destroyed) return
      if (!isSpeechRecognitionSupported()) {
        options.onError?.('Wake word detection is not supported in this browser')
        return
      }
      running = true
      paused = false
      startRecognition()
    },
    stop() {
      running = false
      paused = false
      clearRestartTimer()
      if (recognition) {
        try {
          recognition.abort()
        } catch {
          /* ignore */
        }
      }
      options.onStatusChange?.(false)
    },
    pause() {
      paused = true
      clearRestartTimer()
      if (recognition) {
        try {
          recognition.stop()
        } catch {
          /* ignore */
        }
      }
      options.onStatusChange?.(false)
    },
    resume() {
      if (destroyed || !running) return
      paused = false
      startRecognition()
    },
    isRunning() {
      return running && !paused && !destroyed
    },
    destroy() {
      destroyed = true
      this.stop()
      recognition = null
    },
  }
}

export function isWakeWordSupported(): boolean {
  return isSpeechRecognitionSupported()
}
