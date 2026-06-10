/**
 * AI decision layer for autonomous Zuik agents.
 *
 * makeAgentDecision runs a bounded AgentLoop (perceive-reason-act-observe) with tool use
 * and persistent memory instead of a single Groq call. The decision is ADVISORY: the runner
 * still routes every spend through sendAuthorizedPayment, so the Guardian app is the hard limit.
 *
 * When Groq is unavailable the loop degrades to a deterministic hold.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GuardianContext } from './guardianPolicy.js'
import type { MarketSnapshot } from './marketSnapshot.js'
import type { AgentExecutionContext } from './agentSigner.js'
import { AgentLoop } from './agent/AgentLoop.js'
import { ToolRegistry } from './agent/ToolRegistry.js'

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
  /** Agent address for memory persistence. */
  agentAddress?: string | null
  /** Workflow id for scoped memory retrieval. */
  workflowId?: string | null
  /** Supabase client for agent_memories (server-side). */
  supabase?: SupabaseClient | null
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
  /** Number of perceive-reason-act iterations in the agent loop. */
  loopIterations?: number
}

export interface RawDecision {
  action?: string
  amountAlgo?: number | string
  recipient?: string
  reason?: string
  confidence?: number | string
}

/**
 * Compute the deterministic ceiling (whole ALGO) for this run: the minimum of the Guardian
 * headroom, the agent's operational balance (minus a fee buffer), and any user block cap.
 */
export function computeCeilingAlgo(ctx: AgentDecisionContext): number {
  return ToolRegistry.computeCeilingAlgo(
    ctx.guardian,
    ctx.agentBalanceMicroAlgos,
    ctx.maxAmountAlgo,
  )
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
 * Apply deterministic guardrails to a raw AI proposal. The AI proposes; this clamps.
 */
export function applyGuardrails(
  raw: RawDecision,
  ctx: AgentDecisionContext,
  ceilingAlgo: number,
  source: 'groq' | 'fallback' = 'groq',
): AgentDecision {
  const rawAction = String(raw.action ?? 'hold').toLowerCase()
  let action: AgentAction = rawAction === 'pay' || rawAction === 'notify' ? rawAction : 'hold'
  const reason = String(raw.reason ?? 'No reason provided').slice(0, 400)
  const confidence = parseConfidence(raw.confidence)

  let amountAlgo = 0
  let clamped = false
  const recipient = ctx.recipient ?? null

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
        source,
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

  return { action, amountAlgo, recipient, reason, confidence, clamped, source }
}

let sharedLoop: AgentLoop | null = null

function getAgentLoop(): AgentLoop {
  if (!sharedLoop) {
    sharedLoop = new AgentLoop({ tools: new ToolRegistry() })
  }
  return sharedLoop
}

export interface MakeAgentDecisionOptions {
  agent?: AgentExecutionContext | null
  workflowId?: string | null
}

/**
 * Run the agent reasoning loop and return a structured, guardrail-clamped decision.
 * Never throws on Groq failure: degrades to a deterministic hold so the headless run is safe.
 */
export async function makeAgentDecision(
  ctx: AgentDecisionContext,
  options: MakeAgentDecisionOptions = {},
): Promise<AgentDecision> {
  const loop = getAgentLoop()
  try {
    return await loop.run({
      decisionContext: ctx,
      agent: options.agent ?? null,
      sb: ctx.supabase ?? null,
      workflowId: options.workflowId ?? ctx.workflowId ?? null,
    })
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
