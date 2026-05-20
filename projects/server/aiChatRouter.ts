import { Router } from 'express'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const MAX_MESSAGES = 32
const MAX_MESSAGE_CHARS = 12_000

// Retry configuration for rate limiting
const MAX_RETRIES = 3
const BASE_DELAY = 1000 // 1 second base delay
const MAX_DELAY = 10000 // 10 seconds max delay

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Retry function with exponential backoff for rate limiting
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
  baseDelay = BASE_DELAY
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // If it's not a rate limit error or we've exhausted retries, throw immediately
      if (!isRateLimitError(error) || attempt === maxRetries) {
        throw lastError
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt), MAX_DELAY)
      const jitter = Math.random() * 0.1 * delay // 10% jitter
      const finalDelay = delay + jitter
      
      console.log(`[AiChatRouter] Rate limited, retrying in ${Math.round(finalDelay)}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
      await new Promise(resolve => setTimeout(resolve, finalDelay))
    }
  }
  
  throw lastError
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as any
    return err.status === 429 || err.statusCode === 429 || 
           (err.message && err.message.includes('429')) ||
           (err.message && err.message.toLowerCase().includes('rate limit'))
  }
  return false
}

/**
 * Make a Groq API request with retry logic
 */
async function makeGroqRequest(requestBody: any): Promise<Response> {
  return retryWithBackoff(async () => {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'User-Agent': 'ZuikServer/1.0',
      },
      body: JSON.stringify(requestBody),
    })
    
    // If it's a rate limit error, throw with proper status for retry logic
    if (response.status === 429) {
      const errorText = await response.text()
      const error = new Error(`Groq API rate limit exceeded: ${errorText}`)
      ;(error as any).status = 429
      throw error
    }
    
    return response
  })
}

function sanitizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return []
  const out: ChatMessage[] = []
  for (const item of messages.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const role = row.role
    const content = row.content
    if (role !== 'system' && role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string' || !content.trim()) continue
    out.push({
      role,
      content: content.length > MAX_MESSAGE_CHARS
        ? `${content.slice(0, MAX_MESSAGE_CHARS)}...[truncated]`
        : content,
    })
  }
  return out
}

export function createAiChatRouter(): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, configured: Boolean(GROQ_API_KEY) })
  })

  router.post('/chat', async (req, res) => {
    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: 'GROQ_API_KEY is not set on the server.' })
    }

    const messages = sanitizeMessages(req.body?.messages)
    if (messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required.' })
    }

    const model = typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : GROQ_MODEL
    const temperature = typeof req.body?.temperature === 'number' ? req.body.temperature : 0.12
    const max_tokens = typeof req.body?.max_tokens === 'number' ? req.body.max_tokens : 3072
    const response_format = req.body?.response_format

    try {
      const requestBody = {
        model,
        messages,
        temperature,
        max_tokens,
        ...(response_format ? { response_format } : {}),
      }

      const resGroq = await makeGroqRequest(requestBody)

      const bodyText = await resGroq.text()
      if (!resGroq.ok) {
        const status = resGroq.status >= 500 ? 502 : resGroq.status
        return res.status(status).json({
          error: `Groq API error (${resGroq.status})`,
          detail: bodyText.slice(0, 800),
        })
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(bodyText) as { choices?: unknown[] }
      } catch {
        return res.status(502).json({ error: 'Groq returned non-JSON response.' })
      }
      const choices = (parsed as { choices?: unknown[] }).choices
      if (!Array.isArray(choices) || choices.length === 0) {
        return res.status(502).json({
          error: 'Groq returned no choices (empty completion). Try a shorter message or reduce workflow context.',
        })
      }

      res.type('json').send(bodyText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isRateLimit = isRateLimitError(e)
      
      if (isRateLimit) {
        console.error('[AiChatRouter] Rate limit exceeded after all retries:', msg)
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please try again in a few moments.',
          detail: 'The AI service is currently busy. Please wait a moment before trying again.'
        })
      }
      
      console.error('[AiChatRouter] Request failed:', msg)
      res.status(502).json({ error: `Upstream AI request failed: ${msg}` })
    }
  })

  return router
}
