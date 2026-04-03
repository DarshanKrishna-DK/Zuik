import { getAllBlocks } from '../lib/blockRegistry'
import type { BlockDefinition } from '../lib/blockRegistry'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface IntentStep {
  action: string
  params: Record<string, string | number>
}

export interface ParsedIntent {
  intent: string
  steps: IntentStep[]
  explanation: string
  confidence: number
}

function buildBlockSummary(): string {
  const blocks = getAllBlocks()
  const grouped: Record<string, BlockDefinition[]> = {}
  for (const b of blocks) {
    if (!grouped[b.category]) grouped[b.category] = []
    grouped[b.category].push(b)
  }

  const lines: string[] = []
  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`\n## ${cat.toUpperCase()} blocks:`)
    for (const b of items) {
      const configs = b.config.map((c) => {
        const opts = c.options ? ` (options: ${c.options.map((o) => o.value).join(', ')})` : ''
        return `${c.id}: ${c.type}${opts}`
      })
      lines.push(`- "${b.id}" — ${b.name}: ${b.description}. Config: { ${configs.join(', ')} }`)
    }
  }
  return lines.join('\n')
}

const WELL_KNOWN_ASSETS: Record<string, number> = {
  ALGO: 0,
  USDC: 31566704,
  USDt: 312769,
  USDT: 312769,
  goETH: 386192725,
  goBTC: 386195940,
  PEPE: 1096015467,
}

function buildSystemPrompt(): string {
  return `You are Zuik's intent parser — an AI that converts natural language into structured DeFi workflow steps on the Algorand blockchain.

${buildBlockSummary()}

## Well-known Algorand TestNet Assets:
${Object.entries(WELL_KNOWN_ASSETS).map(([name, id]) => `- ${name} = ASA ID ${id}`).join('\n')}
- ALGO = asset ID 0 (native token)

## Rules:
1. Parse the user's message into a JSON object with these fields:
   - "intent": short snake_case name (e.g. "swap_tokens", "send_payment", "dca_buy", "monitor_and_swap")
   - "steps": array of step objects, each with:
     - "action": must be one of the block IDs listed above (e.g. "swap-token", "send-payment", "timer-loop", "comparator")
     - "params": object mapping config field IDs to values. Use asset IDs (numbers) for token fields. Use the well-known asset mapping above.
   - "explanation": 1-2 sentence human-readable description of what the workflow does
   - "confidence": number 0-1 indicating how sure you are about the parsing
2. For multi-step workflows, order steps as they should execute (triggers first, then actions).
3. If the user mentions a timer/recurring action, start with a "timer-loop" trigger step.
4. If the user wants a conditional, add a "comparator" step between the condition source and the branching actions.
5. If the user mentions a notification (Telegram, Discord, browser alert), add the corresponding notification step at the end.
6. For "DCA" (dollar-cost averaging), use: timer-loop → swap-token.
7. For "alert when price drops below X", use: timer-loop → get-quote → comparator → send-telegram/browser-notify.
8. If the user's request is unclear, still return your best guess with a lower confidence value.
9. For fiat on-ramp/off-ramp, use "fiat-onramp" or "fiat-offramp" blocks.
10. ALWAYS return valid JSON. No markdown fences, no explanation text outside the JSON.`
}

const FEW_SHOT_EXAMPLES = [
  {
    role: 'user' as const,
    content: 'Swap 50 USDC to ALGO',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'swap_tokens',
      steps: [
        { action: 'swap-token', params: { fromAsset: 31566704, toAsset: 0, amount: 50, slippage: 0.5 } },
      ],
      explanation: 'Swap 50 USDC to ALGO using the best DEX route on Algorand.',
      confidence: 0.95,
    }),
  },
  {
    role: 'user' as const,
    content: 'Send 10 ALGO to AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'send_payment',
      steps: [
        { action: 'send-payment', params: { recipient: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ', amount: 10, asset: 0 } },
      ],
      explanation: 'Send 10 ALGO to the specified Algorand address.',
      confidence: 0.97,
    }),
  },
  {
    role: 'user' as const,
    content: 'Every 30 minutes, buy 5 ALGO with USDC',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'dca_buy',
      steps: [
        { action: 'timer-loop', params: { interval: 1800 } },
        { action: 'swap-token', params: { fromAsset: 31566704, toAsset: 0, amount: 5, slippage: 0.5 } },
      ],
      explanation: 'Dollar-cost average into ALGO by swapping 5 USDC to ALGO every 30 minutes.',
      confidence: 0.93,
    }),
  },
  {
    role: 'user' as const,
    content: 'Alert me on Telegram if ALGO price drops below 0.15 USDC',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'price_alert',
      steps: [
        { action: 'timer-loop', params: { interval: 60 } },
        { action: 'get-quote', params: { fromAsset: 0, toAsset: 31566704, amount: 1 } },
        { action: 'comparator', params: { operator: '<', threshold: '0.15' } },
        { action: 'send-telegram', params: { message: 'ALGO price dropped below 0.15 USDC! Current quote: {{get-quote.quoteAmount}}' } },
      ],
      explanation: 'Check ALGO/USDC price every minute and send a Telegram alert when it drops below 0.15.',
      confidence: 0.90,
    }),
  },
]

export async function parseIntent(
  userMessage: string,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
): Promise<ParsedIntent> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured. Set VITE_GROQ_API_KEY in your .env file.')
  }

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt() },
    ...FEW_SHOT_EXAMPLES,
  ]

  if (conversationHistory) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  messages.push({ role: 'user' as const, content: userMessage })

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1024,
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Groq API error (${resp.status}): ${err}`)
  }

  const data = await resp.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) {
    throw new Error('Empty response from Groq API')
  }

  const parsed: ParsedIntent = JSON.parse(raw)

  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error('Invalid intent: missing steps array')
  }

  return parsed
}

export function isGroqConfigured(): boolean {
  return Boolean(GROQ_API_KEY)
}
