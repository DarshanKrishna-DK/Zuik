// Client-side voice service that communicates with the voice server
import { useState, useRef, useCallback } from 'react'

const VOICE_SERVER_URL = import.meta.env.VITE_VOICE_SERVER_URL || 'http://localhost:3002'

export interface TranscriptionResult {
  text: string
  language: string
  duration?: number
  confidence: number
}

export interface VoiceServiceConfig {
  language?: string
  voiceId?: string
  autoDetectLanguage?: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  language: string
}

/**
 * Check if voice server is available and configured
 */
export async function checkVoiceServiceHealth(): Promise<{
  available: boolean
  services: { groq: boolean; elevenlabs: boolean }
}> {
  try {
    const response = await fetch(`${VOICE_SERVER_URL}/health`)
    if (!response.ok) {
      return { available: false, services: { groq: false, elevenlabs: false } }
    }
    
    const data = await response.json()
    return {
      available: true,
      services: {
        groq: data.services?.groq === 'configured',
        elevenlabs: data.services?.elevenlabs === 'configured',
      },
    }
  } catch (error) {
    console.warn('[VoiceService] Health check failed:', error)
    return { available: false, services: { groq: false, elevenlabs: false } }
  }
}

/**
 * Transcribe audio to text using server-side Groq Whisper
 */
export async function transcribeAudio(
  audioBlob: Blob,
  config?: VoiceServiceConfig,
): Promise<TranscriptionResult> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'audio.webm')
  
  if (config?.language) {
    formData.append('language', config.language)
  }
  
  // Detect format from blob type
  const format = audioBlob.type.includes('webm') ? 'webm' : 
                audioBlob.type.includes('mp3') ? 'mp3' :
                audioBlob.type.includes('wav') ? 'wav' : 'webm'
  formData.append('format', format)

  try {
    const response = await fetch(`${VOICE_SERVER_URL}/api/voice/transcribe`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Transcription failed' }))
      throw new Error(error.error || 'Transcription failed')
    }

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error || 'Transcription failed')
    }

    return result.transcription
  } catch (error) {
    console.error('[VoiceService] Transcription failed:', error)
    throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Synthesize text to speech using server-side ElevenLabs
 */
export async function synthesizeSpeech(
  text: string,
  config?: VoiceServiceConfig,
): Promise<ArrayBuffer> {
  try {
    const body: Record<string, unknown> = { text }
    
    if (config?.voiceId) {
      body.voiceId = config.voiceId
    }
    
    if (config?.language || config?.autoDetectLanguage) {
      // Let server auto-detect language if autoDetectLanguage is true
      if (!config.autoDetectLanguage && config.language) {
        body.language = config.language
      }
    }

    const response = await fetch(`${VOICE_SERVER_URL}/api/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMsg = 'Speech synthesis failed'
      
      try {
        const errorJson = JSON.parse(errorText)
        errorMsg = errorJson.error || errorMsg
      } catch {
        // Use default error message
      }
      
      throw new Error(errorMsg)
    }

    // Response is audio data
    const audioData = await response.arrayBuffer()
    return audioData
  } catch (error) {
    console.error('[VoiceService] TTS failed:', error)
    throw new Error(`Speech synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get list of available voices from server
 */
export async function getAvailableVoices(): Promise<VoiceInfo[]> {
  try {
    const response = await fetch(`${VOICE_SERVER_URL}/api/voice/voices`)
    
    if (!response.ok) {
      console.warn('[VoiceService] Failed to fetch voices')
      return []
    }

    const result = await response.json()
    
    if (!result.success) {
      console.warn('[VoiceService] Voice fetch failed:', result.error)
      return []
    }

    return result.voices || []
  } catch (error) {
    console.warn('[VoiceService] Error fetching voices:', error)
    return []
  }
}

/**
 * Detect language of text using server
 */
export async function detectLanguage(text: string): Promise<string> {
  try {
    const response = await fetch(`${VOICE_SERVER_URL}/api/voice/detect-language`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      return 'en' // Default fallback
    }

    const result = await response.json()
    return result.success ? result.language : 'en'
  } catch (error) {
    console.warn('[VoiceService] Language detection failed:', error)
    return 'en' // Default fallback
  }
}

/**
 * Play audio from ArrayBuffer
 */
export async function playAudio(audioData: ArrayBuffer): Promise<HTMLAudioElement> {
  const blob = new Blob([audioData], { type: 'audio/mpeg' })
  const audioUrl = URL.createObjectURL(blob)
  
  const audio = new Audio(audioUrl)
  
  // Clean up object URL when audio finishes or errors
  const cleanup = () => {
    URL.revokeObjectURL(audioUrl)
  }
  
  audio.addEventListener('ended', cleanup, { once: true })
  audio.addEventListener('error', cleanup, { once: true })
  
  // Play audio
  await audio.play()
  
  return audio
}

/**
 * Enhanced speech recognition hook with server-side transcription fallback
 */
export function useEnhancedSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [useServerTranscription, setUseServerTranscription] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const browserSpeechSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        
        if (audioBlob.size > 0) {
          setIsTranscribing(true)
          try {
            const result = await transcribeAudio(audioBlob, { autoDetectLanguage: true })
            setTranscript(result.text)
          } catch (error) {
            console.error('[EnhancedSpeech] Server transcription failed:', error)
            setTranscript('') // Clear transcript on error
          } finally {
            setIsTranscribing(false)
          }
        }
        
        // Clean up stream
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsListening(true)
      
    } catch (error) {
      console.error('[EnhancedSpeech] Failed to start recording:', error)
      setIsListening(false)
    }
  }, [])

  const startBrowserRecognition = useCallback(() => {
    if (!browserSpeechSupported) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'
    
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      setTranscript(text)
      
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null
        try {
          recognition.stop()
        } catch { /* ignore */ }
      }, 1800) // 1.8 second silence timeout
    }
    
    recognition.onstart = () => {
      clearSilenceTimer()
      setIsListening(true)
    }
    
    recognition.onend = () => {
      clearSilenceTimer()
      setIsListening(false)
    }
    
    recognition.onerror = () => {
      clearSilenceTimer()
      setIsListening(false)
    }
    
    recognitionRef.current = recognition
    setTranscript('')
    recognition.start()
  }, [browserSpeechSupported, clearSilenceTimer])

  const start = useCallback(async () => {
    if (useServerTranscription || !browserSpeechSupported) {
      await startRecording()
    } else {
      startBrowserRecognition()
    }
  }, [useServerTranscription, browserSpeechSupported, startRecording, startBrowserRecognition])

  const stop = useCallback(() => {
    clearSilenceTimer()
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch { /* ignore */ }
    }
    
    setIsListening(false)
  }, [clearSilenceTimer])

  const clearTranscript = useCallback(() => {
    setTranscript('')
  }, [])

  return {
    isListening,
    transcript,
    isTranscribing,
    start,
    stop,
    clearTranscript,
    supported: browserSpeechSupported || true, // Server transcription is always available
    useServerTranscription,
    setUseServerTranscription,
  }
}