import {
  checkVoiceServiceHealth,
  playAudio,
  synthesizeSpeech,
  transcribeAudio,
  type VoiceServiceConfig,
} from '../voiceService'
import type { VoicePipelineConfig } from './types'

const DEFAULT_SILENCE_MS = 5000  // 5 seconds for better conversation flow
const DEFAULT_MIN_RECORDING_MS = 400
const DEFAULT_MAX_RECORDING_MS = 45000  // 45 seconds for longer conversations

export interface CaptureResult {
  text: string
  confidence: number
  durationMs: number
}

export interface VoicePipeline {
  checkHealth: () => Promise<{ available: boolean; groq: boolean; elevenlabs: boolean }>
  captureSpeech: (options?: {
    onInterim?: (text: string) => void
    signal?: AbortSignal
  }) => Promise<CaptureResult>
  speak: (text: string, signal?: AbortSignal) => Promise<void>
  stopSpeaking: () => void
  stopCapture: () => void
  destroy: () => void
}

function isBrowserSpeechSupported(): boolean {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

function createMediaCapture(
  config: VoicePipelineConfig,
  onInterim: ((text: string) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<CaptureResult> {
  const silenceTimeoutMs = config.silenceTimeoutMs ?? DEFAULT_SILENCE_MS
  const minRecordingMs = config.minRecordingMs ?? DEFAULT_MIN_RECORDING_MS
  const maxRecordingMs = config.maxRecordingMs ?? DEFAULT_MAX_RECORDING_MS

  return new Promise((resolve, reject) => {
    let settled = false
    let mediaRecorder: MediaRecorder | null = null
    let stream: MediaStream | null = null
    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    let maxTimer: ReturnType<typeof setTimeout> | null = null
    let startedAt = 0
    const chunks: Blob[] = []

    const cleanup = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      if (maxTimer) clearTimeout(maxTimer)
      silenceTimer = null
      maxTimer = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
    }

    const finish = async () => {
      if (settled) return
      settled = true
      cleanup()

      const durationMs = Date.now() - startedAt
      const blob = new Blob(chunks, { type: 'audio/webm' })

      if (blob.size === 0 || durationMs < minRecordingMs) {
        reject(new Error('No speech detected'))
        return
      }

      try {
        onInterim?.('Transcribing...')
        const result = await transcribeAudio(blob, {
          language: config.language,
          autoDetectLanguage: !config.language,
        })
        resolve({
          text: result.text.trim(),
          confidence: result.confidence,
          durationMs,
        })
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Transcription failed'))
      }
    }

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => {
        if (mediaRecorder?.state === 'recording') {
          mediaRecorder.stop()
        }
      }, silenceTimeoutMs)
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      if (mediaRecorder?.state === 'recording') {
        try {
          mediaRecorder.stop()
        } catch {
          /* ignore */
        }
      }
      reject(new DOMException('Capture aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((mediaStream) => {
        if (settled) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }

        stream = mediaStream
        startedAt = Date.now()
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' })

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data)
            resetSilenceTimer()
          }
        }

        mediaRecorder.onstop = () => {
          void finish()
        }

        mediaRecorder.onerror = () => {
          if (!settled) {
            settled = true
            cleanup()
            reject(new Error('Recording failed'))
          }
        }

        mediaRecorder.start(250)
        resetSilenceTimer()
        maxTimer = setTimeout(() => {
          if (mediaRecorder?.state === 'recording') {
            mediaRecorder.stop()
          }
        }, maxRecordingMs)
      })
      .catch((error) => {
        if (!settled) {
          settled = true
          cleanup()
          reject(error instanceof Error ? error : new Error('Microphone access denied'))
        }
      })
  })
}

function createBrowserSpeechCapture(
  config: VoicePipelineConfig,
  onInterim: ((text: string) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<CaptureResult> {
  const silenceTimeoutMs = config.silenceTimeoutMs ?? DEFAULT_SILENCE_MS

  return new Promise((resolve, reject) => {
    if (!isBrowserSpeechSupported()) {
      reject(new Error('Speech recognition not supported'))
      return
    }

    let settled = false
    let recognition: SpeechRecognition | null = null
    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    let transcript = ''
    const startedAt = Date.now()

    const cleanup = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = null
    }

    const finish = (text: string) => {
      if (settled) return
      settled = true
      cleanup()
      try {
        recognition?.stop()
      } catch {
        /* ignore */
      }

      const trimmed = text.trim()
      if (!trimmed) {
        reject(new Error('No speech detected'))
        return
      }

      resolve({
        text: trimmed,
        confidence: 0.85,
        durationMs: Date.now() - startedAt,
      })
    }

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => finish(transcript), silenceTimeoutMs)
    }

    signal?.addEventListener('abort', () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        recognition?.abort()
      } catch {
        /* ignore */
      }
      reject(new DOMException('Capture aborted', 'AbortError'))
    }, { once: true })

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = config.language ? `${config.language}-US` : 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0]?.transcript ?? ''
      }
      console.log('[BrowserSpeech] Recognition result:', transcript)
      onInterim?.(transcript)
      resetSilenceTimer()
    }

    recognition.onerror = (event) => {
      console.log('[BrowserSpeech] Recognition error:', event.error)
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error(`Speech recognition failed: ${event.error || 'unknown'}`))
      }
    }

    recognition.onend = () => {
      if (!settled && transcript.trim()) {
        finish(transcript)
      }
    }

    try {
      recognition.start()
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Failed to start speech recognition'))
    }
  })
}

export function createVoicePipeline(config: VoicePipelineConfig = {}): VoicePipeline {
  let currentAudio: HTMLAudioElement | null = null
  let captureAbort: AbortController | null = null
  let preferServerStt = false  // Default to browser STT for faster response
  let healthCache: { available: boolean; groq: boolean; elevenlabs: boolean } | null = null

  const voiceConfig: VoiceServiceConfig = {
    language: config.language,
    voiceId: config.voiceId,
    autoDetectLanguage: !config.language,
  }

  return {
    async checkHealth() {
      try {
        const health = await checkVoiceServiceHealth()
        healthCache = {
          available: health.available,
          groq: health.services.groq,
          elevenlabs: health.services.elevenlabs,
        }
        console.log('[VoicePipeline] Health check:', healthCache)
        // Keep browser STT as default for performance
        preferServerStt = false
        return healthCache
      } catch (error) {
        console.log('[VoicePipeline] Health check failed:', error)
        healthCache = { available: false, groq: false, elevenlabs: false }
        preferServerStt = false
        return healthCache
      }
    },

    async captureSpeech(options) {
      captureAbort?.abort()
      captureAbort = new AbortController()
      const signal = options?.signal ?? captureAbort.signal

      // Always try browser speech first for fastest response
      if (isBrowserSpeechSupported()) {
        try {
          return await createBrowserSpeechCapture(config, options?.onInterim, signal)
        } catch (error) {
          // Only fallback to server STT if browser fails and server is available
          if (healthCache?.groq && !(error instanceof DOMException && error.name === 'AbortError')) {
            return createMediaCapture(config, options?.onInterim, signal)
          }
          throw error
        }
      }

      // Use server STT if browser speech not supported
      if (healthCache?.groq) {
        return createMediaCapture(config, options?.onInterim, signal)
      }

      throw new Error('No speech recognition available')
    },

    async speak(text, signal) {
      this.stopSpeaking()

      if (!text.trim()) return

      const audioData = await synthesizeSpeech(text, voiceConfig)
      if (signal?.aborted) return

      const audio = await playAudio(audioData)
      currentAudio = audio

      await new Promise<void>((resolve, reject) => {
        const onDone = () => {
          cleanup()
          resolve()
        }
        const onFail = () => {
          cleanup()
          reject(new Error('Audio playback failed'))
        }
        const onAbort = () => {
          audio.pause()
          cleanup()
          reject(new DOMException('Speech aborted', 'AbortError'))
        }

        const cleanup = () => {
          audio.removeEventListener('ended', onDone)
          audio.removeEventListener('error', onFail)
          signal?.removeEventListener('abort', onAbort)
          if (currentAudio === audio) {
            currentAudio = null
          }
        }

        audio.addEventListener('ended', onDone, { once: true })
        audio.addEventListener('error', onFail, { once: true })
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },

    stopSpeaking() {
      if (currentAudio) {
        currentAudio.pause()
        currentAudio = null
      }
    },

    stopCapture() {
      captureAbort?.abort()
      captureAbort = null
    },

    destroy() {
      this.stopSpeaking()
      this.stopCapture()
      healthCache = null
    },
  }
}

export async function prefetchVoiceHealth(): Promise<{
  available: boolean
  groq: boolean
  elevenlabs: boolean
}> {
  const pipeline = createVoicePipeline()
  return pipeline.checkHealth()
}
