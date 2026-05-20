// Vercel Function for Voice Transcription
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY
  if (!GROQ_API_KEY) {
    res.status(503).json({ error: 'Voice service not configured - missing Groq API key' })
    return
  }

  try {
    // For now, return a simple message since Vercel Functions have limitations with file uploads
    res.status(200).json({ 
      text: 'Voice transcription is not yet implemented in the Vercel deployment. Use text input instead.',
      note: 'File upload handling in Vercel Functions requires additional configuration.'
    })
  } catch (error) {
    console.error('[Voice Transcribe] Error:', error)
    res.status(500).json({ 
      error: 'Transcription failed',
      detail: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}