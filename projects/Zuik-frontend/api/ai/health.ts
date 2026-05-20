import { VercelRequest, VercelResponse } from '@vercel/node'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  res.json({ 
    ok: true, 
    configured: Boolean(GROQ_API_KEY),
    timestamp: new Date().toISOString() 
  })
}