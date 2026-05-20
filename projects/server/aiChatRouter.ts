import { Router } from 'express'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const MAX_MESSAGES = 32
const MAX_MESSAGE_CHARS = 12_000

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
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
      const resGroq = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'User-Agent': 'ZuikServer/1.0',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          ...(response_format ? { response_format } : {}),
        }),
      })

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
      res.status(502).json({ error: `Upstream AI request failed: ${msg}` })
    }
  })

  return router
}
