// Vercel Function for Voice Transcription
import { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
    const form = formidable({
      maxFileSize: 25 * 1024 * 1024, // 25MB limit
    })

    const [fields, files] = await form.parse(req)
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio

    if (!audioFile) {
      res.status(400).json({ error: 'No audio file provided' })
      return
    }

    // Read the audio file
    const audioBuffer = fs.readFileSync(audioFile.filepath)
    
    // Create form data for Groq API
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: audioFile.mimetype || 'audio/wav' }), audioFile.originalFilename || 'audio.wav')
    formData.append('model', 'whisper-large-v3')
    formData.append('response_format', 'json')

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    })

    // Clean up temp file
    fs.unlinkSync(audioFile.filepath)

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error('Groq transcription error:', errorText)
      res.status(groqResponse.status).json({ 
        error: `Transcription failed (${groqResponse.status})`,
        detail: errorText 
      })
      return
    }

    const data = await groqResponse.json()
    res.status(200).json({ text: data.text || '' })

  } catch (error) {
    console.error('Transcription error:', error)
    res.status(500).json({ 
      error: 'Transcription failed',
      detail: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}