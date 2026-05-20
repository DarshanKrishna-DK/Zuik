// Vercel Function for Voice Health Check
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const groqConfigured = !!process.env.GROQ_API_KEY
    const elevenlabsConfigured = !!process.env.ELEVENLABS_API_KEY

    res.status(200).json({
      status: 'healthy',
      services: {
        groq: groqConfigured ? 'configured' : 'missing',
        elevenlabs: elevenlabsConfigured ? 'configured' : 'missing'
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Voice health check error:', error)
    res.status(500).json({ error: 'Health check failed' })
  }
}