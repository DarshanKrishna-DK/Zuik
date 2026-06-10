import 'dotenv/config'
import { createReadStream, createWriteStream, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Groq from 'groq-sdk'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'

let groqClient: Groq | null = null
let elevenLabsClient: ElevenLabsClient | null = null

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

export async function transcribeAudio(
  audioBuffer: Buffer,
  language?: string,
  format: string = 'webm',
): Promise<TranscriptionResult> {
  if (!groqClient) {
    throw new Error('Groq client not initialized. Set GROQ_API_KEY environment variable.')
  }

  const tempFilePath = join(tmpdir(), `audio_${Date.now()}.${format}`)

  try {
    const writeStream = createWriteStream(tempFilePath)
    writeStream.write(audioBuffer)
    writeStream.end()

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    const transcription = await groqClient.audio.transcriptions.create({
      file: createReadStream(tempFilePath),
      model: 'whisper-large-v3-turbo',
      language: language || undefined,
      response_format: 'verbose_json',
      temperature: 0.1,
    })

    const verbose = transcription as { text: string; language?: string; duration?: number }

    return {
      text: verbose.text,
      language: verbose.language || 'unknown',
      duration: verbose.duration,
      confidence: 0.9,
    }
  } catch (error) {
    console.error('[VoiceService] Transcription failed:', error)
    throw new Error(`Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    try {
      unlinkSync(tempFilePath)
    } catch {
      // temp file cleanup
    }
  }
}

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
    const modelId = 'eleven_multilingual_v2'

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
      duration: undefined,
    }
  } catch (error) {
    console.error('[VoiceService] TTS synthesis failed:', error)
    throw new Error(`Text-to-speech synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export function detectLanguage(text: string): string {
  const hindiPattern = /[\u0900-\u097F]/
  const englishPattern = /[a-zA-Z]/

  if (hindiPattern.test(text)) {
    return 'hi'
  } else if (englishPattern.test(text)) {
    return 'en'
  }
  return 'en'
}

export function isVoiceServiceConfigured(): { groq: boolean; elevenlabs: boolean } {
  return {
    groq: Boolean(GROQ_API_KEY && groqClient),
    elevenlabs: Boolean(ELEVENLABS_API_KEY && elevenLabsClient),
  }
}

export async function getAvailableVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
  if (!elevenLabsClient) {
    return []
  }

  try {
    const voicesResponse = await elevenLabsClient.voices.getAll()
    return voicesResponse.voices?.map((voice) => ({
      id: voice.voiceId || '',
      name: voice.name || 'Unknown',
      language: voice.labels?.language || 'en',
    })) || []
  } catch (error) {
    console.error('[VoiceService] Failed to fetch voices:', error)
    return []
  }
}