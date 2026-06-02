/**
 * Uses Groq (same stack as the web intent parser) to turn natural language into
 * ParsedWorkflowIntent JSON, then materializes flow nodes for Supabase.
 */

import { materializeTelegramIntent, type ParsedWorkflowIntent } from './materializeIntent.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Retry configuration for rate limiting
const MAX_RETRIES = 3
const BASE_DELAY = 1000 // 1 second base delay
const MAX_DELAY = 10000 // 10 seconds max delay

/**
 * Retry function with exponential backoff for rate limiting
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
  baseDelay = BASE_DELAY
): Promise<T> {
  let lastError: Error = new Error('Request failed')
  
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
      
      console.log(`[WorkflowIntentGroq] Rate limited, retrying in ${Math.round(finalDelay)}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
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

/** Short block catalog for the model (keep in sync with Zuik builder concepts). */
const BLOCK_CATALOG = `
TRIGGERS: timer-loop (interval sec, maxIterations), wallet-event (address, assetId, pollInterval, amountMode received|total), webhook-receiver (path), telegram-trigger (chatId, pattern)
ACTIONS: swap-token (fromAsset, toAsset, amount, slippage), send-payment (recipient, amount, asset, note), opt-in-asa (assetId), create-asa, call-contract
LOGIC: comparator (operator, threshold, compareField optional), delay (duration sec), math-op (operation, b), filter, rate-limiter, variable-set
NOTIFICATIONS: send-telegram (chatId, message), send-discord, browser-notify
DATA: get-quote, price-monitor, pool-info, portfolio-balance, constant, merge, transform-data, http-request, log-debug

TestNet assets: ALGO=0, USDC=10458941. Amounts in human units (e.g. 10 for 10 USDC unless using template vars).
Use timer-loop as first block when the user wants a recurring or "run this" automation without a wallet-event.
Order: trigger first, then actions left-to-right.
`

const SYSTEM = `You are Zuik's workflow builder for Telegram. The user describes a workflow in plain English.
Return ONLY valid JSON (no markdown) with this shape:
{
  "intent": "snake_case_name",
  "workflowName": "Short title for the workflow list",
  "steps": [ { "action": "block_id", "params": { "configKey": value } } ],
  "explanation": "One paragraph for the user",
  "confidence": 0.0 to 1.0
}

Rules:
- "action" MUST be a block id from the catalog below.
- Fill params for that block's config fields. Use numeric asset IDs for fromAsset, toAsset, asset when tokens are named.
- For send-telegram, set chatId to the placeholder "{{telegram_chat_id}}" if the user did not give a chat id (the app will substitute).
- For wallet-event, set address to "{{user_wallet}}" when the user's own wallet is implied.
- If the user only asks a question (no workflow), return steps: [] and explanation with the answer.

${BLOCK_CATALOG}
`

export interface BuildWorkflowResult {
  ok: boolean
  error?: string
  parsed?: ParsedWorkflowIntent
  flowJson?: { nodes: unknown[]; edges: unknown[] }
}

export async function buildWorkflowFromText(
  userText: string,
  ctx: { walletAddress?: string | null; telegramChatId?: string | null },
): Promise<BuildWorkflowResult> {
  if (!GROQ_API_KEY) {
    return { ok: false, error: 'GROQ_API_KEY is not set on the server.' }
  }

  const ctxLines: string[] = []
  if (ctx.walletAddress) ctxLines.push(`Linked wallet: ${ctx.walletAddress}`)
  if (ctx.telegramChatId) ctxLines.push(`Telegram chat ID: ${ctx.telegramChatId}`)

  const userPayload = [
    ctxLines.length ? `User context:\n${ctxLines.join('\n')}` : '',
    `Request:\n${userText.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const requestBody = {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPayload },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }

    const res = await retryWithBackoff(async () => {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
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

    if (!res.ok) {
      const errText = await res.text()
      return { ok: false, error: `Groq error: ${res.status} ${errText.slice(0, 200)}` }
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = data.choices?.[0]?.message?.content
    if (!raw) {
      return { ok: false, error: 'Empty model response.' }
    }

    const parsed = JSON.parse(raw) as ParsedWorkflowIntent
    if (!parsed.steps || !Array.isArray(parsed.steps)) {
      return { ok: false, error: 'Invalid response: missing steps array.' }
    }

    if (parsed.steps.length === 0) {
      return { ok: true, parsed, flowJson: { nodes: [], edges: [] } }
    }

    const { nodes, edges } = materializeTelegramIntent(parsed)
    return {
      ok: true,
      parsed,
      flowJson: { nodes, edges },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isRateLimit = isRateLimitError(e)
    
    if (isRateLimit) {
      console.error('[WorkflowIntentGroq] Rate limit exceeded after all retries:', msg)
      return { 
        ok: false, 
        error: 'Rate limit exceeded. Please try again in a few moments. The AI service is currently busy.'
      }
    }
    
    console.error('[WorkflowIntentGroq] Request failed:', msg)
    return { ok: false, error: msg }
  }
}
