import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import cors from 'cors'
import { transcribeAudio, synthesizeSpeech, detectLanguage, isVoiceServiceConfigured, getAvailableVoices } from './voiceService.js'

const app = express()
const PORT = parseInt(process.env.VOICE_SERVER_PORT || '3002', 10)

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for audio files
  },
  fileFilter: (_req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm') {
      cb(null, true)
    } else {
      cb(new Error('Only audio files are allowed'), false)
    }
  },
})

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  const services = isVoiceServiceConfigured()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      groq: services.groq ? 'configured' : 'missing_api_key',
      elevenlabs: services.elevenlabs ? 'configured' : 'missing_api_key',
    },
  })
})

/**
 * Transcribe audio to text
 */
app.post('/api/voice/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' })
    }

    const language = req.body.language || undefined
    const format = req.body.format || 'webm'

    console.log(`[VoiceServer] Transcribing ${req.file.size} bytes of ${req.file.mimetype}`)

    const result = await transcribeAudio(req.file.buffer, language, format)

    res.json({
      success: true,
      transcription: result,
    })
  } catch (error) {
    console.error('[VoiceServer] Transcription error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
    })
  }
})

/**
 * Synthesize text to speech
 */
app.post('/api/voice/synthesize', async (req, res) => {
  try {
    const { text, voiceId, language } = req.body

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' })
    }

    console.log(`[VoiceServer] Synthesizing: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`)

    // Auto-detect language if not provided
    const detectedLanguage = language || detectLanguage(text)

    const result = await synthesizeSpeech(text, voiceId, detectedLanguage)

    // Set appropriate headers for audio response
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', result.audioData.length)
    res.setHeader('Cache-Control', 'no-cache')
    
    // Send audio data
    res.send(Buffer.from(result.audioData))
  } catch (error) {
    console.error('[VoiceServer] TTS error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Text-to-speech synthesis failed',
    })
  }
})

/**
 * Get available voices
 */
app.get('/api/voice/voices', async (_req, res) => {
  try {
    const voices = await getAvailableVoices()
    res.json({
      success: true,
      voices,
    })
  } catch (error) {
    console.error('[VoiceServer] Error fetching voices:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available voices',
      voices: [],
    })
  }
})

/**
 * Language detection endpoint
 */
app.post('/api/voice/detect-language', async (req, res) => {
  try {
    const { text } = req.body

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' })
    }

    const language = detectLanguage(text)
    
    res.json({
      success: true,
      language,
    })
  } catch (error) {
    console.error('[VoiceServer] Language detection error:', error)
    res.status(500).json({
      success: false,
      error: 'Language detection failed',
    })
  }
})

/**
 * Error handling middleware
 */
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[VoiceServer] Unhandled error:', error)
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Audio file too large (max 10MB)' })
    }
    return res.status(400).json({ error: error.message })
  }

  res.status(500).json({ error: 'Internal server error' })
})

/**
 * 404 handler
 */
app.use('*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

/**
 * Start server
 */
function startVoiceServer() {
  const services = isVoiceServiceConfigured()
  
  console.log('╔══════════════════════════════════════╗')
  console.log('║       Zuik Voice Server v1.0.0       ║')
  console.log('╚══════════════════════════════════════╝')
  console.log(`[VoiceServer] Port: ${PORT}`)
  console.log(`[VoiceServer] Groq Whisper: ${services.groq ? '✅ Ready' : '❌ Missing API key'}`)
  console.log(`[VoiceServer] ElevenLabs TTS: ${services.elevenlabs ? '✅ Ready' : '❌ Missing API key'}`)
  
  if (!services.groq && !services.elevenlabs) {
    console.warn('[VoiceServer] ⚠️  No voice services configured. Set GROQ_API_KEY and ELEVENLABS_API_KEY.')
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VoiceServer] 🎤 Voice server running on http://localhost:${PORT}`)
  })
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startVoiceServer()
}

export { app, startVoiceServer }