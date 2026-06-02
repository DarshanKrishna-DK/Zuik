/**
 * AI decision layer for autonomous Zuik agents.
 *
 * makeAgentDecision turns a saved natural-language strategy plus a live snapshot (agent balance,
 * market, Guardian policy) into ONE structured decision using a single Groq call
 * (llama-3.3-70b-versatile, the model already wired across the repo). The decision is ADVISORY:
 * the runner still routes every spend through sendAuthorizedPayment, so the Guardian app is the
 * hard limit. The AI can never move funds on its own and can never exceed maxPerTrade / daily cap
 * / allowlist - those are asserted on-chain by authorize_trade.
 *
 * Free-tier mandate: exactly one LLM call per decision (not per price tick), Groq only, no paid
 * model. When Groq is unavailable the function degrades to a deterministic 'hold' and says so.
 */

import type { GuardianContext } from './guardianPolicy.js'
import { maxSpendableMicroAlgos } from './guardianPolicy.js'
import type { MarketSnapshot } from './marketSnapshot.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const MICRO = 1_000_000

export type AgentAction = 'pay' | 'hold' | 'notify'

export interface AgentDecisionContext {
  /** Free-text strategy stored with the workflow, e.g. "DCA 0.2 ALGO into treasury when ALGO dips". */
  userStrategy: string
  /** Agent sub-account spendable balance in microAlgos (off-chain operational check). */
  agentBalanceMicroAlgos: bigint
  market: MarketSnapshot
  guardian: GuardianContext
  /** Optional preferred recipient from block config; AI may only pay to this address. */
  recipient?: string | null
  /** Optional hard cap (whole ALGO) the user set on the block, on top of Guardian. */
  maxAmountAlgo?: number | null
}

export interface AgentDecision {
  action: AgentAction
  /** Whole ALGO the AI proposes to pay (0 for hold/notify). Already clamped to limits. */
  amountAlgo: number
  recipient?: string | null
  reason: string
  confidence: number
  /** True when the AI's raw proposal was reduced by a deterministic guardrail. */
  clamped: boolean
  /** 'groq' when an LLM call produced the decision, 'fallback' when it degraded to hold. */
  source: 'groq' | 'fallback'
}

interface RawDecision {
  action?: string
  amountAlgo?: number | string
  recipient?: string
  reason?: string
  confidence?: number | string
}

function microToAlgo(micro: bigint): number {
  return Number(micro) / MICRO
}

function buildSystemPrompt(): string {
  return [
    'You are Zuik\'s autonomous trading agent operating on Algorand TestNet.',
    'You decide ONE action for this run based on the user strategy, live market data, the agent balance, and the on-chain Guardian policy limits.',
    'You are ADVISORY only: a Guardian smart contract enforces every spend on-chain, so never assume you can exceed the stated limits.',
    '',
    'Return ONLY valid JSON (no markdown) with this exact shape:',
    '{',
    '  "action": "pay" | "hold" | "notify",',
    '  "amountAlgo": number,            // whole ALGO to send; 0 when not paying',
    '  "recipient": string | null,      // Algorand address; use the provided recipient when paying',
    '  "reason": string,                // one concise sentence explaining the decision',
    '  "confidence": number             // 0.0 to 1.0',
    '}',
    '',
    'Rules:',
    '- "pay" only when the strategy conditions are clearly met AND a recipient is provided. Otherwise "hold" or "notify".',
    '- amountAlgo MUST be <= the maxSpendableAlgo value given in the context. Smaller is fine.',
    '- Never invent a recipient. If no recipient is provided, you cannot "pay"; choose "hold" or "notify".',
    '- If market data is missing or partial, prefer "hold" with low confidence unless the strategy is purely time/balance based.',
    '- Keep reason short and factual. No financial advice disclaimers.',
  ].join('\n')
}

function buildUserPrompt(ctx: AgentDecisionContext, maxSpendableAlgo: number): string {
  const m = ctx.market
  const lines: string[] = []
  lines.push(`User strategy: ${ctx.userStrategy || '(none provided)'}`)
  lines.push('')
  lines.push('Live context:')
  lines.push(`- Agent balance: ${microToAlgo(ctx.agentBalanceMicroAlgos).toFixed(6)} ALGO`)
  lines.push(`- ALGO price USD: ${m.algoUsd ?? 'unknown'}`)
  lines.push(`- ALGO 24h change %: ${m.algoChange24h ?? 'unknown'}`)
  if (m.asset) {
    lines.push(
      `- Asset ${m.asset.assetId}: priceUsd=${m.asset.priceUsd ?? 'unknown'}, ` +
        `liquidityUsd=${m.asset.liquidityUsd ?? 'unknown'}, vol24h=${m.asset.volume24h ?? 'unknown'}`,
    )
  }
  lines.push(`- Market sources answered: ${m.sources.join(', ') || 'none'}`)
  lines.push('')
  lines.push('Guardian on-chain limits (hard, enforced regardless of your answer):')
  lines.push(`- maxSpendableAlgo this run: ${maxSpendableAlgo.toFixed(6)} ALGO`)
  lines.push(`- Guardian blocked: ${ctx.guardian.blocked}${ctx.guardian.blockReason ? ` (${ctx.guardian.blockReason})` : ''}`)
  lines.push(`- recipient available: ${ctx.recipient ? ctx.recipient : 'none (cannot pay)'}`)
  return lines.join('\n')
}

function parseAmount(raw: number | string | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  if (typeof raw === 'string') {
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function parseConfidence(raw: number | string | undefined): number {
  const n = parseAmount(raw)
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

/**
 * Compute the deterministic ceiling (whole ALGO) for this run: the minimum of the Guardian
 * headroom, the agent's operational balance (minus a fee buffer), and any user block cap.
 */
function computeCeilingAlgo(ctx: AgentDecisionContext): number {
  const guardianMicro = maxSpendableMicroAlgos(ctx.guardian)
  // Keep ~0.01 ALGO for fees and min balance so the on-chain preflight does not reject.
  const FEE_BUFFER = 10_000n
  const balanceMicro = ctx.agentBalanceMicroAlgos > FEE_BUFFER
    ? ctx.agentBalanceMicroAlgos - FEE_BUFFER
    : 0n
  let ceilingMicro = guardianMicro < balanceMicro ? guardianMicro : balanceMicro
  if (ceilingMicro < 0n) ceilingMicro = 0n
  let ceilingAlgo = microToAlgo(ceilingMicro)
  if (typeof ctx.maxAmountAlgo === 'number' && ctx.maxAmountAlgo > 0) {
    ceilingAlgo = Math.min(ceilingAlgo, ctx.maxAmountAlgo)
  }
  return ceilingAlgo
}

/**
 * Apply deterministic guardrails to a raw AI proposal. The AI proposes; this clamps.
 * - If Guardian is blocked or no recipient, force hold/notify.
 * - Clamp amount to the ceiling. If a "pay" rounds to 0 spendable, demote to "hold".
 */
function applyGuardrails(raw: RawDecision, ctx: AgentDecisionContext, ceilingAlgo: number): AgentDecision {
  const rawAction = String(raw.action ?? 'hold').toLowerCase()
  let action: AgentAction = rawAction === 'pay' || rawAction === 'notify' ? rawAction : 'hold'
  const reason = String(raw.reason ?? 'No reason provided').slice(0, 400)
  const confidence = parseConfidence(raw.confidence)

  let amountAlgo = 0
  let clamped = false
  let recipient = ctx.recipient ?? null

  if (action === 'pay') {
    if (ctx.guardian.blocked) {
      action = 'notify'
      clamped = true
      return {
        action,
        amountAlgo: 0,
        recipient,
        reason: `${reason} [blocked by Guardian: ${ctx.guardian.blockReason ?? 'limit reached'}]`,
        confidence,
        clamped,
        source: 'groq',
      }
    }
    if (!recipient) {
      action = 'hold'
      clamped = true
    } else {
      const proposed = parseAmount(raw.amountAlgo)
      amountAlgo = Math.max(0, Math.min(proposed, ceilingAlgo))
      if (amountAlgo < proposed) clamped = true
      if (amountAlgo <= 0) {
        action = 'hold'
        clamped = true
        amountAlgo = 0
      }
    }
  }

  return { action, amountAlgo, recipient, reason, confidence, clamped, source: 'groq' }
}

/**
 * Run ONE Groq decision call for the agent. Returns a structured, guardrail-clamped decision.
 * Never throws on Groq failure: degrades to a deterministic hold so the headless run is safe.
 */
export async function makeAgentDecision(ctx: AgentDecisionContext): Promise<AgentDecision> {
  const ceilingAlgo = computeCeilingAlgo(ctx)

  // Deterministic short-circuit: if nothing can ever be spent, do not waste an LLM call.
  if (ctx.guardian.blocked || ceilingAlgo <= 0 || !ctx.recipient) {
    const reason = ctx.guardian.blocked
      ? `Guardian blocked: ${ctx.guardian.blockReason ?? 'limit reached'}`
      : !ctx.recipient
        ? 'No recipient configured; cannot pay'
        : 'No spendable headroom this run'
    return {
      action: ctx.guardian.blocked ? 'notify' : 'hold',
      amountAlgo: 0,
      recipient: ctx.recipient ?? null,
      reason,
      confidence: 1,
      clamped: false,
      source: 'fallback',
    }
  }

  if (!GROQ_API_KEY) {
    return {
      action: 'hold',
      amountAlgo: 0,
      recipient: ctx.recipient ?? null,
      reason: 'GROQ_API_KEY not configured on the server; holding by default',
      confidence: 0,
      clamped: false,
      source: 'fallback',
    }
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(ctx, ceilingAlgo) },
        ],
        temperature: 0.15,
        max_tokens: 512,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200)
      return {
        action: 'hold',
        amountAlgo: 0,
        recipient: ctx.recipient ?? null,
        reason: `Groq error ${res.status}; holding. ${detail}`,
        confidence: 0,
        clamped: false,
        source: 'fallback',
      }
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return {
        action: 'hold',
        amountAlgo: 0,
        recipient: ctx.recipient ?? null,
        reason: 'Empty Groq response; holding',
        confidence: 0,
        clamped: false,
        source: 'fallback',
      }
    }

    const raw = JSON.parse(content) as RawDecision
    return applyGuardrails(raw, ctx, ceilingAlgo)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      action: 'hold',
      amountAlgo: 0,
      recipient: ctx.recipient ?? null,
      reason: `AI decision failed (${msg}); holding`,
      confidence: 0,
      clamped: false,
      source: 'fallback',
    }
  }
}
