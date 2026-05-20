// Vercel Function for AI Chat API
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Import your existing server logic
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS for your Vercel domain
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

  if (!GROQ_API_KEY) {
    res.status(503).json({ error: 'AI service not configured - missing GROQ_API_KEY' })
    return
  }

  try {
    const { model, messages, response_format, temperature, max_tokens } = req.body

    console.log('[AI Chat] Processing request with model:', model || GROQ_MODEL)
    console.log('[AI Chat] Messages count:', messages?.length || 0)

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || GROQ_MODEL,
        messages,
        response_format,
        temperature: temperature || 0.12,
        max_tokens: max_tokens || 3072,
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error('[AI Chat] Groq API error:', errorText)
      res.status(groqResponse.status).json({ 
        error: `Groq API error (${groqResponse.status})`,
        detail: errorText 
      })
      return
    }

    const data = await groqResponse.json()
    console.log('[AI Chat] ✅ Success - Response received from Groq')
    res.status(200).json(data)
  } catch (error) {
    console.error('[AI Chat] Internal error:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      detail: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}