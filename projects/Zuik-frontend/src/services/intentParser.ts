import { getAllBlocks } from '../lib/blockRegistry'
import type { BlockDefinition } from '../lib/blockRegistry'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface IntentStep {
  action: string
  params: Record<string, string | number>
}

export interface BlockModification {
  nodeId?: string
  blockId: string
  configChanges: Record<string, string | number>
}

export interface ParsedIntent {
  intent: string
  steps: IntentStep[]
  explanation: string
  confidence: number
  advisor_message?: string
  risk_level?: 'conservative' | 'moderate' | 'aggressive'
  strategy_name?: string
  modifications?: BlockModification[]
  replaceCanvas?: boolean
  deleteNodeIds?: string[]
}

export interface UserContext {
  walletAddress?: string
  telegramChatId?: string
}

export interface CanvasBlock {
  nodeId: string
  blockId: string
  blockName: string
  config: Record<string, string | number | undefined>
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
      lines.push(`- "${b.id}" - ${b.name}: ${b.description}. Config: { ${configs.join(', ')} }`)
    }
  }
  return lines.join('\n')
}

const WELL_KNOWN_ASSETS: Record<string, number> = {
  ALGO: 0,
  USDC: 10458941,
  USDt: 10458941,
  USDT: 10458941,
}

const MAINNET_ASSETS: Record<string, number> = {
  ALGO: 0,
  USDC: 31566704,
  USDt: 312769,
  USDT: 312769,
  goETH: 386192725,
  goBTC: 386195940,
}

function buildCanvasSummary(canvasBlocks?: CanvasBlock[]): string {
  if (!canvasBlocks || canvasBlocks.length === 0) return '\n## CURRENT CANVAS STATE: Empty (no blocks on canvas)'

  const lines = ['\n## CURRENT CANVAS STATE (blocks the user has already placed):']
  for (const block of canvasBlocks) {
    const configEntries = Object.entries(block.config)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    lines.push(`- Node "${block.nodeId}": ${block.blockName} (${block.blockId})${configEntries ? ` { ${configEntries} }` : ''}`)
  }
  return lines.join('\n')
}

function buildUserContext(ctx?: UserContext): string {
  const lines: string[] = []
  if (ctx?.walletAddress) lines.push(`- Connected wallet address: ${ctx.walletAddress}`)
  if (ctx?.telegramChatId) lines.push(`- Telegram Chat ID: ${ctx.telegramChatId}`)
  if (lines.length === 0) return ''
  return `\n## USER CONTEXT (auto-fill these values when creating blocks):\n${lines.join('\n')}`
}

function buildSystemPrompt(canvasBlocks?: CanvasBlock[], userContext?: UserContext): string {
  const hasBlocks = canvasBlocks && canvasBlocks.length > 0

  return `You are Zuik's AI assistant - an expert in DeFi workflows on Algorand. You BOTH build workflows AND answer questions.

${buildBlockSummary()}

## Well-known Algorand TestNet Assets:
${Object.entries(WELL_KNOWN_ASSETS).map(([name, id]) => `- ${name} = ASA ID ${id}`).join('\n')}
- ALGO = asset ID 0 (native token)
${buildCanvasSummary(canvasBlocks)}
${buildUserContext(userContext)}

## DeFi Knowledge:
- Algorand uses microAlgo internally (1 ALGO = 1,000,000 microAlgo). When the user says "10 ALGO", the amount field should be 10.
- Tinyman V2 is the primary DEX on Algorand TestNet. Folks Router on mainnet.
- DCA (Dollar-Cost Averaging): invest a fixed amount at regular intervals.
- Slippage: difference between expected and actual execution price. 0.5% is safe default.
- ASA opt-in is required before receiving any Algorand Standard Asset.
- Atomic transaction groups execute all-or-nothing.

## PERCENTAGE / DYNAMIC AMOUNT WORKFLOWS:
When the user says "swap X% of received amount", this is how to build it correctly:
1. "wallet-event" trigger (watches for incoming tokens, set "address" to user's connected wallet from USER CONTEXT). Always set "amountMode" to "received" unless the user explicitly wants to swap their entire on-chain balance of that asset (then use "total").
2. "math-op" block with operation "percentage" and b = the percentage number (e.g. b=20 for 20%, b=50 for 50%). The math block receives the amount from upstream and calculates A * (B / 100).
3. "swap-token" block - the amount field should be set to "{{math-op.result}}" (a dynamic variable referencing the math block's output)

IMPORTANT: For the swap-token amount when it depends on a previous block's output, set it to the variable reference string "{{math-op.result}}" or "{{wallet-event.amount}}" - NOT to 0 or empty.

With amountMode "received", "{{wallet-event.amount}}" is the net change in that asset since the last poll (approximates what just arrived), not the whole wallet balance. With "total", it is the full balance (rare; use only when the user asks to empty the wallet of that asset).

When user says "swap it all" (100% of what arrived), skip the math-op block and set the swap amount to "{{wallet-event.amount}}" with amountMode "received".
When user says "swap 50%", use math-op with operation="percentage" and b=50.

## AUTO-FILL RULES:
- wallet-event "address" field → ALWAYS use the connected wallet address from USER CONTEXT (never leave blank)
- send-telegram "chatId" field → ALWAYS use the Telegram Chat ID from USER CONTEXT (never use "your_chat_id")
- If USER CONTEXT values are not available, leave a clear placeholder explaining what the user needs to fill in.

## CRITICAL: Classify the user's message into ONE of these categories:

### Category 1: QUESTION (user asking "why", "what", "how", "explain", "what is", etc.)
If the user is asking a question about their workflow, a concept, or why something was done:
- Set "intent" to "answer_question"
- Set "steps" to [] (empty array - DO NOT generate any blocks)
- Set "explanation" to your detailed answer
- Set "confidence" to 0
Questions include: "why did you use multiply?", "what does this workflow do?", "explain slippage", "what is DCA?"

### Category 2: MODIFY EXISTING BLOCK (user says "change", "update", "modify" a specific block's config)
${hasBlocks ? `The user has blocks on canvas. If they want to change a config value on an existing block:
- Set "intent" to "modify_block"
- Set "steps" to [] (empty)
- Set "modifications" to an array of objects, each with:
  - "blockId": the block type (e.g. "swap-token")
  - "nodeId": the specific node ID from CURRENT CANVAS STATE (e.g. "intent_1234_0")
  - "configChanges": object with ONLY the fields that need to change (e.g. { "toAsset": 10458941 })
- Set "explanation" to what you changed and why
Example: "change swap to USDT instead of ALGO" → modifications: [{ "blockId": "swap-token", "nodeId": "<actual node id>", "configChanges": { "toAsset": 10458941 } }]` : 'No blocks on canvas yet, so modification is not applicable.'}

### Category 3: DELETE BLOCK (user says "delete", "remove" a specific block)
${hasBlocks ? `If the user wants to remove/delete a block from the canvas:
- Set "intent" to "delete_block"
- Set "steps" to [] (empty)
- Set "deleteNodeIds" to an array of node IDs to remove (from CURRENT CANVAS STATE)
- Set "explanation" to what was removed
Example: "delete the math operation block" → find the math-op node ID from canvas state and set deleteNodeIds: ["<node_id>"]` : 'No blocks on canvas.'}

### Category 4: ADD TO EXISTING WORKFLOW (user says "add", "also", "then", "after that", "connect")
${hasBlocks ? `The canvas already has blocks. Generate ONLY the NEW blocks needed - do NOT recreate existing blocks.
- Set "intent" to a descriptive name like "add_telegram_alert"
- Set "steps" to ONLY the new blocks
- Set "replaceCanvas" to false
- Set "explanation" to what was added` : 'No blocks exist yet, so this will be treated as a new workflow.'}

### Category 5: BUILD NEW WORKFLOW (user describes a full workflow from scratch)
${hasBlocks ? `If the user describes a COMPLETE NEW workflow and the canvas already has blocks, you should REPLACE the canvas:
- Set "intent" to a descriptive name
- Set "replaceCanvas" to true
- Set "steps" to the full workflow
- Set "explanation" describing what it does

BUT if the user's request is clearly about extending the current workflow (mentions "add", "also", "then"), use Category 4 instead.` : `Canvas is empty. Generate the full workflow.
- Set "intent" to a descriptive name
- Set "steps" to the workflow blocks in execution order
- Set "explanation" describing what it does`}

### Category 6: DESCRIBE WORKFLOW
When the user says "describe", "explain workflow", "what does this do", "analyze":
- Set "intent" to "describe_workflow"
- Set "steps" to []
- Set "explanation" to a detailed description of the current canvas workflow

## Confidence Score:
The confidence score (0-1) reflects how certain you are that you correctly interpreted the user's intent:
- 0.95+: Exact, unambiguous request like "Swap 50 USDC to ALGO"
- 0.80-0.95: Clear request with minor assumptions (e.g. default slippage)
- 0.60-0.80: Ambiguous request where you made reasonable guesses
- Below 0.60: Very unclear, you're guessing. Ask for clarification in explanation.
- 0: Not a workflow request (question, description, etc.)

## Currency Context:
When discussing amounts, include approximate INR equivalents (1 ALGO ≈ ₹15-20, 1 USDC ≈ ₹84, 1 USDT ≈ ₹84).

## Response Format:
Return a JSON object with:
- "intent": short snake_case name
- "steps": array of { "action": blockId, "params": { configField: value } }
- "explanation": human-readable description shown to the user
- "confidence": number 0-1
- "modifications": (optional) array of block modifications for modify_block intent
- "replaceCanvas": (optional) boolean, true to replace entire canvas
- "deleteNodeIds": (optional) array of node IDs to delete

## Rules:
1. For multi-step workflows, order steps as they should execute (triggers first).
2. Timer/recurring → start with "timer-loop" trigger.
3. Conditional → add "comparator" between source and branching actions.
4. Notifications (Telegram, Discord) → add at the end.
5. DCA → timer-loop → swap-token.
6. "Alert when price drops below X" → timer-loop → get-quote → comparator → send-telegram.
7. ALWAYS fill ALL required config fields. Never leave amount, fromAsset, toAsset empty. Use dynamic variables like "{{wallet-event.amount}}" or "{{math-op.result}}" when the value depends on runtime data.
8. When user says "swap it all to X" after a wallet-event trigger (meaning all of the incoming amount), set wallet-event amountMode to "received" and swap amount to "{{wallet-event.amount}}". Only use amountMode "total" if they clearly mean their entire balance of that asset.
9. When user says "swap N% of it", use math-op with operation="percentage" and b=N, and set swap amount to "{{math-op.result}}".
10. ALWAYS return valid JSON. No markdown fences.
11. Be conversational in explanations. Suggest follow-ups like "Would you like me to add a Telegram alert for this?" or "I can also add a stop-loss."
12. After building a workflow, mention approximate execution time and fees.`
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
        { action: 'swap-token', params: { fromAsset: 10458941, toAsset: 0, amount: 50, slippage: 0.5 } },
      ],
      explanation: 'Swap 50 USDC to ALGO using Tinyman DEX. With 0.5% slippage protection, the swap executes in about 5 seconds with minimal fees. Would you like me to add a Telegram notification when the swap completes?',
      confidence: 0.95,
    }),
  },
  {
    role: 'user' as const,
    content: 'When I receive USDC, swap it all to ALGO',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'auto_swap_on_receive',
      steps: [
        { action: 'wallet-event', params: { assetId: 10458941, address: '{{user_wallet}}', pollInterval: 15, amountMode: 'received' } },
        { action: 'swap-token', params: { fromAsset: 10458941, toAsset: 0, amount: '{{wallet-event.amount}}', slippage: 0.5 } },
      ],
      explanation: 'Watching your connected wallet for incoming USDC. When the balance of that asset increases between checks, the trigger passes that net amount as {{wallet-event.amount}} and swaps it to ALGO via Tinyman (not your whole wallet balance). The wallet is checked every 15 seconds. Would you like me to add a Telegram alert when the swap executes?',
      confidence: 0.92,
    }),
  },
  {
    role: 'user' as const,
    content: 'When I receive USDC, swap 20% of it to ALGO',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'partial_swap_on_receive',
      steps: [
        { action: 'wallet-event', params: { assetId: 10458941, address: '{{user_wallet}}', pollInterval: 15, amountMode: 'received' } },
        { action: 'math-op', params: { operation: 'percentage', b: 20 } },
        { action: 'swap-token', params: { fromAsset: 10458941, toAsset: 0, amount: '{{math-op.result}}', slippage: 0.5 } },
      ],
      explanation: 'Watching your wallet for incoming USDC. When USDC arrives:\n1. The Math Operation block calculates 20% of the received amount\n2. The Swap block automatically swaps that 20% portion to ALGO\n\nFor example, if you receive 100 USDC, it will swap 20 USDC to ALGO. The remaining 80 USDC stays in your wallet. Would you like me to add a Telegram notification?',
      confidence: 0.93,
    }),
  },
  {
    role: 'user' as const,
    content: 'Why did you use a multiply operator?',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'answer_question',
      steps: [],
      explanation: 'The Math Operation block with "percentage" calculates a percentage of the received amount. When you say "swap 20% of received USDC", the math block takes the amount and applies 20%:\n\n- Receive 100 USDC → 100 * 20% = 20 USDC gets swapped\n- Receive 500 USDC → 500 * 20% = 100 USDC gets swapped\n\nThe math block sits between the Wallet Event trigger (which detects the incoming amount) and the Swap block (which needs to know how much to swap). Without it, the swap wouldn\'t know what "20%" of a dynamic amount means.',
      confidence: 0,
    }),
  },
  {
    role: 'user' as const,
    content: 'Change the swap token block to swap USDC to USDT instead of ALGO',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'modify_block',
      steps: [],
      modifications: [{ blockId: 'swap-token', configChanges: { toAsset: 10458941 } }],
      explanation: 'Updated the Swap Token block: changed the destination asset from ALGO to USDT. Your swap will now convert USDC to USDT instead. Both are stablecoins, so the swap should have minimal price impact.',
      confidence: 0.95,
    }),
  },
  {
    role: 'user' as const,
    content: 'Delete the math operation block',
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      intent: 'delete_block',
      steps: [],
      deleteNodeIds: ['<math-op node id from canvas>'],
      explanation: 'Removed the Math Operation block from your workflow. Note: The swap block was previously using the math output for the amount. You may need to update the swap amount - would you like me to set it to swap the full received amount instead?',
      confidence: 0.95,
    }),
  },
]

function buildAdvisorPrompt(canvasBlocks?: CanvasBlock[], userContext?: UserContext): string {
  return `You are Zuik's Smart Trading Advisor - a knowledgeable, friendly AI that helps users with DeFi strategies on Algorand. You are conversational and proactive.

${buildBlockSummary()}

## Well-known Algorand TestNet Assets:
${Object.entries(WELL_KNOWN_ASSETS).map(([name, id]) => `- ${name} = ASA ID ${id}`).join('\n')}
- ALGO = asset ID 0 (native token)
${buildCanvasSummary(canvasBlocks)}
${buildUserContext(userContext)}

## Your Behavior:
1. Be conversational and friendly - like talking to a knowledgeable friend, not a robot.
2. ALWAYS include INR equivalents (1 ALGO ≈ ₹15-20, 1 USDC ≈ ₹84, 1 USDT ≈ ₹84). Beginners need this.
3. After any workflow, suggest additions: "Want me to add a Telegram alert?", "I can set a stop-loss too."
4. Give specific numbers: execution time (~5s per block), fees (~0.001 ALGO ≈ ₹0.02 per tx).
5. If the user asks a question, answer thoroughly in advisor_message with steps: [].
6. If the user wants a workflow, generate it in steps AND explain in advisor_message.
7. Proactively suggest strategies: DCA, stop-loss, take-profit, rebalancing.
8. Ask clarifying questions: risk tolerance, budget, time horizon.

## Special: Describe Workflow
"describe", "explain workflow", "what does this do" → analyze canvas and explain in advisor_message, steps: [].

## Response Format:
JSON with:
- "intent": snake_case name
- "steps": workflow blocks (or [] for questions/descriptions)
- "explanation": short summary
- "confidence": 0-1 (0 for questions)
- "advisor_message": conversational response the user sees (be detailed, specific, helpful)
- "risk_level": "conservative" | "moderate" | "aggressive"
- "strategy_name": catchy strategy name
- "modifications": (optional) for modify_block intent
- "replaceCanvas": (optional) boolean

ALWAYS return valid JSON. No markdown fences.`
}

export async function parseIntent(
  userMessage: string,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
  advisorMode = false,
  canvasBlocks?: CanvasBlock[],
  userContext?: UserContext,
): Promise<ParsedIntent> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured. Set VITE_GROQ_API_KEY in your .env file.')
  }

  const systemContent = advisorMode
    ? buildAdvisorPrompt(canvasBlocks, userContext)
    : buildSystemPrompt(canvasBlocks, userContext)

  const messages = [
    { role: 'system' as const, content: systemContent },
    ...(advisorMode ? [] : FEW_SHOT_EXAMPLES),
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
      temperature: 0.12,
      max_tokens: 3072,
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

  let parsed: ParsedIntent
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('AI returned invalid JSON. Please try rephrasing your request.')
  }

  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    parsed.steps = []
  }

  // Forward-resolve modifications: if AI returns modifications without nodeId,
  // try to match by blockId from canvasBlocks
  if (parsed.intent === 'modify_block' && parsed.modifications && canvasBlocks) {
    for (const mod of parsed.modifications) {
      if (!mod.nodeId) {
        const match = canvasBlocks.find((b) => b.blockId === mod.blockId)
        if (match) mod.nodeId = match.nodeId
      }
    }
  }

  // Forward-resolve deleteNodeIds: if AI returned block type names or placeholders
  if (parsed.intent === 'delete_block' && parsed.deleteNodeIds && canvasBlocks) {
    parsed.deleteNodeIds = parsed.deleteNodeIds.map((id) => {
      const existsOnCanvas = canvasBlocks.some((b) => b.nodeId === id)
      if (existsOnCanvas) return id
      // Try to match by blockId
      const match = canvasBlocks.find((b) => b.blockId === id || b.blockName.toLowerCase().includes(id.toLowerCase()))
      return match ? match.nodeId : id
    }).filter(Boolean)
  }

  // Replace {{user_wallet}} placeholder with actual wallet address
  if (userContext?.walletAddress) {
    for (const step of parsed.steps) {
      for (const [key, val] of Object.entries(step.params)) {
        if (val === '{{user_wallet}}') {
          step.params[key] = userContext.walletAddress
        }
      }
    }
  }

  return parsed
}

export function isGroqConfigured(): boolean {
  return Boolean(GROQ_API_KEY)
}
