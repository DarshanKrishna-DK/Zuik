import 'dotenv/config'
import { createWriteStream, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Groq from 'groq-sdk'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb' // Default voice

let groqClient: Groq | null = null
let elevenLabsClient: ElevenLabsClient | null = null

// Initialize clients
if (GROQ_API_KEY) {
  groqClient = new Groq({ apiKey: GROQ_API_KEY })
}

if (ELEVENLABS_API_KEY) {
  elevenLabsClient = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY })
}

export interface TranscriptionResult {
  text: string
  language: string
  duration?: number
  confidence: number
}

export interface TTSResult {
  audioData: Uint8Array
  format: string
  duration?: number
}

/**
 * Transcribe audio buffer to text using Groq Whisper
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  language?: string,
  format: string = 'webm',
): Promise<TranscriptionResult> {
  if (!groqClient) {
    throw new Error('Groq client not initialized. Set GROQ_API_KEY environment variable.')
  }

  // Create temporary file
  const tempFilePath = join(tmpdir(), `audio_${Date.now()}.${format}`)
  
  try {
    // Write buffer to temporary file
    const writeStream = createWriteStream(tempFilePath)
    writeStream.write(audioBuffer)
    writeStream.end()

    // Wait for file to be written
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    // Transcribe using Groq Whisper
    const transcription = await groqClient.audio.transcriptions.create({
      file: readFileSync(tempFilePath),
      model: 'whisper-large-v3-turbo',
      language: language || undefined,
      response_format: 'verbose_json',
      temperature: 0.1, // Low temperature for more consistent results
    })

    return {
      text: transcription.text,
      language: transcription.language || 'unknown',
      duration: transcription.duration,
      confidence: 0.9, // Groq Whisper typically has high accuracy
    }
  } catch (error) {
    console.error('[VoiceService] Transcription failed:', error)
    throw new Error(`Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    // Clean up temporary file
    try {
      unlinkSync(tempFilePath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert text to speech using ElevenLabs
 */
export async function synthesizeSpeech(
  text: string,
  voiceId?: string,
  language?: string,
): Promise<TTSResult> {
  if (!elevenLabsClient) {
    throw new Error('ElevenLabs client not initialized. Set ELEVENLABS_API_KEY environment variable.')
  }

  try {
    const voice = voiceId || ELEVENLABS_VOICE_ID
    
    // Choose model based on language
    let modelId = 'eleven_multilingual_v2'
    if (language === 'hi' || language?.startsWith('hi')) {
      modelId = 'eleven_multilingual_v2' // Supports Hindi
    }

    const audioStream = await elevenLabsClient.textToSpeech.convert(voice, {
      text,
      modelId,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: 0.7,
        similarityBoost: 0.8,
        style: 0.3,
        useSpeakerBoost: true,
      },
    })

    // Collect audio chunks
    const chunks: Uint8Array[] = []
    for await (const chunk of audioStream) {
      chunks.push(chunk)
    }

    const audioData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      audioData.set(chunk, offset)
      offset += chunk.length
    }

    return {
      audioData,
      format: 'mp3',
      duration: undefined, // ElevenLabs doesn't provide duration in the basic response
    }
  } catch (error) {
    console.error('[VoiceService] TTS synthesis failed:', error)
    throw new Error(`Text-to-speech synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Detect language from text (basic heuristic)
 */
export function detectLanguage(text: string): string {
  // Simple language detection based on character sets
  const hindiPattern = /[\u0900-\u097F]/
  const englishPattern = /[a-zA-Z]/

  if (hindiPattern.test(text)) {
    return 'hi'
  } else if (englishPattern.test(text)) {
    return 'en'
  }
  return 'en' // Default to English
}

/**
 * Check if voice services are configured
 */
export function isVoiceServiceConfigured(): { groq: boolean; elevenlabs: boolean } {
  return {
    groq: Boolean(GROQ_API_KEY && groqClient),
    elevenlabs: Boolean(ELEVENLABS_API_KEY && elevenLabsClient),
  }
}

/**
 * Get available voice IDs from ElevenLabs
 */
export async function getAvailableVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
  if (!elevenLabsClient) {
    return []
  }

  try {
    const voicesResponse = await elevenLabsClient.voices.getAll()
    return voicesResponse.voices?.map((voice) => ({
      id: voice.voice_id || '',
      name: voice.name || 'Unknown',
      language: voice.labels?.language || 'en',
    })) || []
  } catch (error) {
    console.error('[VoiceService] Failed to fetch voices:', error)
    return []
  }
}